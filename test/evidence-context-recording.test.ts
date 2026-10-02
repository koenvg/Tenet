import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validRecord } from '../src/recording/contract.js';
import { readArchive } from '../src/recording/archive.js';
import { invocationView } from '../src/inspector/view.js';
import { UNAVAILABLE_EVIDENCE_CONTEXT } from '../src/decision/evidence-context.js';
import { startBridge, exchange, writeLocalState } from '../src/claude/bridge.js';
import type { OwnerRecord } from '../src/sdk/types.js';
import { answer } from './helpers.js';

const row = (schemaVersion: number, data: Record<string, unknown>) => ({ schemaVersion, host: 'pi', contextId: 'main',
  sessionId: 's', invocationId: 'i', callId: 'c', toolName: 'unfamiliar', cwd: '/synthetic', mode: 'enforce',
  writerId: randomUUID(), eventId: randomUUID(), sequence: 1, timestamp: 0, stage: 'decision', data });

test('schema 4 requires bounded explicit diagnostic identities; older payloads are not reinterpreted', () => {
  const valid = row(4, { decision: 'BLOCK', evidenceContext: UNAVAILABLE_EVIDENCE_CONTEXT });
  assert.equal(validRecord(valid), true);
  for (const context of [undefined, null, { ...UNAVAILABLE_EVIDENCE_CONTEXT, version: 'unknown' },
    { ...UNAVAILABLE_EVIDENCE_CONTEXT, selectionVersion: 'bounded-history-unknown' },
    { ...UNAVAILABLE_EVIDENCE_CONTEXT, history: {} },
    { ...UNAVAILABLE_EVIDENCE_CONTEXT, resolution: { status: 'unsupported', limitations: ['x'.repeat(129)], limitationsTruncated: false } },
    { ...UNAVAILABLE_EVIDENCE_CONTEXT, resolution: { status: 'unsupported', limitations: Array(17).fill('gap'), limitationsTruncated: false } },
    { ...UNAVAILABLE_EVIDENCE_CONTEXT, secret: 'not permitted' },
  ]) assert.equal(validRecord(row(4, { decision: 'BLOCK', evidenceContext: context })), false);
  for (const version of [1, 2, 3]) {
    const old: any = row(version, { decision: 'BLOCK', reason: 'insufficient-evidence', recordedThreshold: .73 });
    if (version === 1) { delete old.host; delete old.contextId; }
    const bytes = JSON.stringify(old);
    assert.equal(validRecord(old), true);
    assert.equal(invocationView([old]).evidenceContext, null);
    assert.equal(invocationView([old]).reason, 'insufficient-evidence');
    assert.equal(invocationView([old]).noRulesClassifiedViolated, false);
    assert.equal(JSON.stringify(old), bytes);
  }
});
test('schema-4 v1 history diagnostics remain exactly recorded, without inventing v2 counters', () => {
  const context = { ...UNAVAILABLE_EVIDENCE_CONTEXT, selectionVersion: 'bounded-history-v1', preparation: 'completed',
    resolution: { status: 'unsupported', limitations: [], limitationsTruncated: false },
    current: { redactedFields: 0, limitations: [], limitationsTruncated: false },
    history: { recentEvents: 12, maxBytes: 24576, retainedEvents: 1, retainedBytes: 21000, omittedEvents: 2,
      limitations: ['history-omitted'], limitationsTruncated: false } };
  const record: any = row(4, { decision: 'BLOCK', evidenceContext: context, questionVersion: 'policy-rules-v6-applicability' });
  const before = JSON.stringify(record);
  assert.equal(validRecord(record), true);
  const view = invocationView([record]);
  assert.deepEqual(view.evidenceContext, context);
  assert.equal(view.evidenceContext?.history?.shortenedEvents, undefined);
  assert.equal(JSON.stringify(record), before);
});

test('schema-4 v2 diagnostic validates matching loss counters and effective byte limits', () => {
  const context = { ...UNAVAILABLE_EVIDENCE_CONTEXT, preparation: 'completed',
    resolution: { status: 'unsupported', limitations: [], limitationsTruncated: false },
    current: { redactedFields: 0, limitations: [], limitationsTruncated: false },
    history: { recentEvents: 12, maxBytes: 24576, retainedEvents: 1, retainedBytes: 1000, omittedEvents: 2,
      maxHistoryBytes: 8192, maxEventBytes: 2048, shortenedEvents: 1, droppedEvents: 1, priorOmittedEvents: 1,
      exactCompactedBytes: 0, limitations: [], limitationsTruncated: false } };
  assert.equal(validRecord(row(4, { decision: 'BLOCK', evidenceContext: context })), true);
  assert.equal(validRecord(row(4, { decision: 'BLOCK', evidenceContext: { ...context, history: { ...context.history, exactCompactedBytes: 5000 } } })), true);
  for (const change of [{ maxHistoryBytes: 8193 }, { maxEventBytes: 2049 }, { retainedBytes: 8193 },
    { shortenedEvents: 2 }, { droppedEvents: 3 }, { priorOmittedEvents: -1 }, { exactCompactedBytes: -1 }, { exactCompactedBytes: 0.5 }]) {
    assert.equal(validRecord(row(4, { decision: 'BLOCK', evidenceContext: { ...context, history: { ...context.history, ...change } } })), false);
  }
  const request: any = { ...row(4, { evidenceContext: context, selectionVersion: 'bounded-history-v1',
    payload: { model: 'offline', questions: {}, state: {} }, policy: { rules: [] }, mapping: [] }), stage: 'request' };
  assert.equal(validRecord(request), false);
});

for (const recording of ['on', 'off', 'failed'] as const) for (const unavailable of [false, true]) {
  test(`Claude owner callback parity and listener invariance: recording ${recording}, unavailable ${unavailable}`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'coverage-claude-')));
    await writeFile(join(root, 'TENET.md'), 'Rule; BLOCK; Keep authored data local.');
    const directory = join(root, 'bridge'), archivePath = join(root, 'archive');
    if (recording === 'failed') await writeFile(archivePath, 'not a directory');
    const live: OwnerRecord[] = [];
    const server = await startBridge({ directory, env: { TENET_MODE: 'enforce', TENET_RECORDING: recording === 'off' ? 'off' : 'on',
      TENET_RECORDING_DIR: archivePath, TENET_CONTROL_PATH: join(root, 'control.json'), ...(unavailable ? { TENET_EVIDENCE_MAX_BYTES: '1' } : {}) },
      judge: async r => answer(r.policy), onOwnerRecord: record => { live.push(record); throw new Error('offline listener fails'); } });
    try {
      const base = { version: 1 as const, sessionId: 's', contextId: 'main', cwd: root };
      const status = await exchange(directory, { ...base, event: 'status' });
      assert.ok(status.generation);
      await writeLocalState(directory, 's', { cwd: root, eligible: true, generation: status.generation });
      assert.equal((await exchange(directory, { ...base, event: 'start' })).decision, 'pass');
      const result = await exchange(directory, { ...base, event: 'call', callId: 'c', toolName: 'Unfamiliar', input: { token: 'canary', value: 1 } });
      assert.equal(result.decision, unavailable ? 'deny' : 'pass');
      assert.ok(!Object.hasOwn(result, 'evidenceContext'), 'protocol stays agent-visible and unchanged');
      const decision = live.find(r => r.stage === 'decision')!;
      assert.ok(decision);
      const context: any = decision.data.evidenceContext;
      assert.equal(context.preparation, unavailable ? 'unavailable' : 'completed');
      assert.equal(context.resolution.status, 'unsupported');
      assert.equal(context.history === null, unavailable);
      assert.ok(Object.isFrozen(context));
      assert.ok(Object.isFrozen(context.resolution.limitations));
      assert.deepEqual(live.find(r => r.stage === 'permission')?.data.evidenceContext, context);
      await server.close();
      const archive = await readArchive(archivePath);
      if (recording === 'on') {
        assert.deepEqual(archive.issues, []);
        assert.deepEqual(invocationView(archive.records).evidenceContext, context);
        for (const record of archive.records.filter(r => ['assessment', 'decision', 'permission'].includes(r.stage))) assert.deepEqual(record.data.evidenceContext, context);
      } else assert.equal(archive.records.length, 0);
      assert.ok(!JSON.stringify([live, archive]).includes('canary'));
    } finally { await server.close().catch(() => {}); await rm(root, { recursive: true, force: true }); }
  });
}

test('prepared request, assessment and final archive stages carry identical diagnostics without modifying payloads', async () => {
  const { recordFixture } = await import('./recording-fixture.js');
  const root = await realpath(await mkdtemp(join(tmpdir(), 'coverage-request-')));
  try {
    const { records, submitted } = await recordFixture(root);
    for (const request of records.filter(r => r.stage === 'request')) {
      assert.equal(request.schemaVersion, 4);
      const invocation = records.filter(r => r.invocationId === request.invocationId);
      for (const stage of invocation.filter(r => ['assessment', 'decision'].includes(r.stage)
        || r.stage === 'assessment-status' && r.data.status === 'completed')) assert.deepEqual(stage.data.evidenceContext, request.data.evidenceContext);
      assert.equal(request.data.selectionVersion, 'bounded-history-v2');
      assert.deepEqual(invocationView(invocation).evidenceContext, request.data.evidenceContext);
      assert.ok(!Object.hasOwn((request.data.payload as any).state, 'evidenceContext'));
    }
    assert.deepEqual(records.filter(r => r.stage === 'request').map(r => r.data.payload), submitted);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('historical raw requests and thresholds remain exactly recorded beside absent diagnostics', () => {
  const payload = { model: 'historical-model', questions: { original: { instructions: 'historical-only' } },
    state: { action: { arguments: { retained: 'unchanged' } }, policy: { rules: [] }, context: {}, trajectory: { observations: [{ original: 'history' }] }, integrity: {} } };
  const request: any = { ...row(3, { payload, policy: { rules: [] }, mapping: [], questionVersion: 'historical-question', profile: 'legacy' }), stage: 'request' };
  const begin: any = { ...row(3, { config: { effectThreshold: .73, evidenceThreshold: .81 }, profile: 'legacy' }), stage: 'begin' };
  const before = JSON.stringify([begin, request]);
  assert.equal(validRecord(request), true);
  const view = invocationView([begin, request]);
  assert.deepEqual(view.evidence, payload.state);
  assert.equal(view.questionVersion, 'historical-question');
  assert.equal(view.config.effectThreshold, .73);
  assert.equal(view.evidenceContext, null);
  assert.equal(JSON.stringify([begin, request]), before);
});


test('historical schema-4 v2 inline requests stay literal and retain zero savings and recorded questions', () => {
  const context = { ...UNAVAILABLE_EVIDENCE_CONTEXT, preparation: 'completed',
    resolution: { status: 'unsupported', limitations: [], limitationsTruncated: false },
    current: { redactedFields: 0, limitations: [], limitationsTruncated: false },
    history: { recentEvents: 12, maxBytes: 24576, retainedEvents: 2, retainedBytes: 2000, omittedEvents: 0,
      maxHistoryBytes: 8192, maxEventBytes: 2048, shortenedEvents: 0, droppedEvents: 0, priorOmittedEvents: 0,
      exactCompactedBytes: 0, limitations: [], limitationsTruncated: false } };
  const payload = { model: 'historical-inline-model', questions: { original: { instructions: 'TENET-23 inline excerpt instructions' } },
    state: { action: {}, policy: { rules: [] }, context: {}, integrity: {}, trajectory: { observations: [0, 1].map(i => ({
      sessionId: 's', callId: String(i), toolName: 'opaque', origin: 'authored', timestamp: i,
      data: { content: { text: 'not compacted historically '.repeat(25), tenetHistory: { ref: 'literal authored' } } },
    })), omitted: 0, limitations: [] } } };
  const record: any = { ...row(4, { payload, evidenceContext: context, selectionVersion: 'bounded-history-v2',
    policy: { rules: [] }, mapping: [], questionVersion: 'policy-rules-v7-evidence-selection' }), stage: 'request' };
  const wire = JSON.stringify(record);
  assert.equal(validRecord(record), true);
  const view = invocationView([record]);
  assert.deepEqual(view.evidence, payload.state); assert.deepEqual(view.evidenceContext, context);
  assert.equal(view.evidenceContext!.history!.exactCompactedBytes, 0);
  assert.equal(JSON.stringify(record), wire);
});
