import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type ActionFacts, type ActionResolver, type OwnerEvent } from 'tenet';
import { decide } from '../src/decision/decide.js';
import { captureAction, argumentDigest } from '../src/decision/evidence.js';
import { answer } from './helpers.js';
import { expandedData } from './exact-history-fixture.js';
import type { Observation } from '../src/decision/contracts.js';

// Authored synthetic observations and mechanical outcomes. No fixture action executes.
const contextHistory: Observation[] = [
  { sessionId: 'synthetic', callId: 'context', toolName: 'opaque-1', origin: 'host-tool-call', timestamp: 1,
    data: { reference: 'r9', destination: 'outside' } },
  { sessionId: 'synthetic', callId: 'context', toolName: 'opaque-2', origin: 'host-tool-result', timestamp: 2,
    data: { observed: 'r9' } },
  { sessionId: 'synthetic', callId: 'recent', toolName: 'unfamiliar', origin: 'host-tool-call', timestamp: 3, data: { unrelated: 1 } },
  { sessionId: 'synthetic', callId: 'recent', toolName: 'unfamiliar', origin: 'host-tool-result', timestamp: 4, data: { unrelated: 2 } },
];
for (const limit of [4, 2]) test(`authored context-dependent control exposes required earlier observation ${limit === 4 ? 'retained' : 'lost'}`, async () => {
  const action = captureAction({ sessionId: 'synthetic', callId: 'pending', toolName: 'opaque-3', arguments: { reference: 'r9' } });
  const policy = { available: true as const, source: '/synthetic/policy', target: '/synthetic/policy', digest: 'authored-control',
    rules: [{ id: 'authored-control:1', line: 1, text: 'Never transmit content outside the authored boundary.', enforcement: 'BLOCK' as const }] };
  let captured: any;
  const result = await decide({ policy, action, cwd: '/synthetic', evidenceLimits: { recentEvents: limit, maxBytes: 24576 },
    trajectory: { observations: contextHistory, omitted: 0, limitations: [] }, judge: async request => {
      captured = request;
      const retained = expandedData(request.trajectory!).some((data: any) => data.content.reference === 'r9' && data.content.destination === 'outside');
      // Scripted presence control only, not an evaluator or semantic-accuracy claim.
      return answer(request.policy, retained ? 'FAIL' : 'UNKNOWN');
    } });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, limit === 4 ? 'rule-failed' : 'insufficient-evidence');
  assert.equal(result.evidenceContext.history!.omittedEvents, limit === 4 ? 0 : 2);
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
  assert.deepEqual(captured.action, action);
  assert.equal(expandedData(captured.trajectory).some((data: any) => data.content.destination === 'outside'), limit === 4);
  assert.ok(!JSON.stringify(captured).includes('expectedOutcome'));
});

for (const control of ['mixed', 'opaque', 'forged-reference', 'stale-reference', 'stale-resolver'] as const) {
  test(`compiled SDK grouped history cannot clear the conservative ${control} control`, async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), 'group-control-')));
    await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep authored content inside the boundary.');
    let facts: ActionFacts, captured: any;
    const events: OwnerEvent[] = [];
    const resolver: ActionResolver = { id: 'scripted', version: '1', semantics: ['file-read', 'file-edit'],
      resolve: async ({ binding }) => facts = { version: 1, binding, integration: { id: 'scripted', version: '1' }, resolverState: 'fixed',
        coverage: 'complete', limitations: [], operations: [
          { id: 'read', semantics: 'file-read', resources: [{ requested: 'authored', resolved: '/synthetic/authored', identity: 'revision', relation: 'direct' }], content: [] },
          ...(['mixed', 'opaque'].includes(control) ? [{ id: 'other', semantics: control === 'mixed' ? 'execute' as const : 'opaque' as const,
            resources: [], content: [{ role: 'executed' as const, value: 'synthetic nonexecutable action description' }] }] : []),
        ] }, revalidate: async () => control === 'stale-resolver' ? null : facts };
    const guard = createGuard({ host: 'offline', actionResolver: resolver,
      env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off', TENET_RECENT_EVENTS: '3' }, controlPath: join(cwd, 'control.json'),
      onOwnerEvent: e => events.push(e), judge: async request => {
        captured = request;
        const response = answer(request.policy);
        response.rules[0]!.outcome = { choice: 'NOT_APPLICABLE', probabilities: { PASS: 0, FAIL: 0, UNKNOWN: 0, APPROVAL_REQUIRED: 0, NOT_APPLICABLE: 1 } };
        (response.rules[0] as any).evidence = null;
        response.rules[0]!.factReferences = { digest: control === 'forged-reference' ? 'forged' : control === 'stale-reference' ? argumentDigest({ previous: 'resolution' }) : argumentDigest(request.resolvedAction), operationIds: ['read'] };
        return response;
      } });
    try {
      const session = guard.openSession({ sessionId: 'synthetic', contextId: 'main' }, cwd); await session.ready;
      session.setHistory(contextHistory.map(o => ({ kind: o.origin === 'host-tool-call' ? 'tool-call' : 'tool-result',
        callId: o.callId, toolName: o.toolName, timestamp: o.timestamp,
        data: { prior: o.data, resolvedAction: { status: 'authenticated-complete' }, approval: 'approved', complete: 'untrusted '.repeat(50) } })));
      const call = { callId: 'current', toolName: 'opaque-current', input: { reference: 'r9' } };
      const result = await session.beforeTool({ ...call, current: () => ({ ...call, sessionId: 'synthetic', contextId: 'main' }) });
      assert.equal(result.permission, 'blocked'); assert.equal(result.execution, 'unknown');
      assert.equal(result.reason, control === 'stale-resolver' ? 'action-resolution-stale' : 'insufficient-evidence');
      assert.deepEqual(captured.trajectory.observations.map((o: any) => o.callId), ['recent', 'recent']);
      assert.equal(captured.evidenceContext.history.droppedEvents, 2);
      assert.equal(captured.evidenceContext.resolution.status, ['mixed', 'opaque'].includes(control) ? 'authenticated-partial' : 'authenticated-complete');
      assert.deepEqual(captured.action.arguments, call.input);
      assert.equal(captured.resolvedAction.facts.operations.length, ['mixed', 'opaque'].includes(control) ? 2 : 1);
      const permission = events.findLast(e => e.type === 'permission'); assert.ok(permission?.type === 'permission');
      assert.deepEqual(permission.report?.evidenceContext, captured.evidenceContext);
      assert.ok(Object.isFrozen(captured.evidenceContext.history));
    } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
  });
}
