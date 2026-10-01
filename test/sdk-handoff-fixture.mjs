import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard } from 'tenet';

// Run from the relocated package under both Node and Bun. No production dependencies.
const host = { host: 'handoff-consumer', hostVersion: '1', hostProfile: 'scripted',
  capabilities: ['interception', 'result-correlation', 'lifecycle-invalidation'] };
const judge = async request => ({ model: 'scripted', profile: 'applicability-v1',
  rules: [...request.policy.rules.map(r => r.id), 'builtin:policy-integrity'].map(ruleId => ({ ruleId,
    outcome: { choice: 'PASS', probabilities: { PASS: 1, APPROVAL_REQUIRED: 0, FAIL: 0, UNKNOWN: 0,
      ...(ruleId === 'builtin:policy-integrity' ? {} : { NOT_APPLICABLE: 0 }) } },
    evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } })) });
for (const source of ['owner', 'microtask']) {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-consumer-handoff-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep content local.');
  let session;
  const guard = createGuard({ ...host, judge,
    env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' }, controlPath: join(cwd, 'control', 'state.json'),
    onOwnerEvent: event => { if (source === 'owner' && event.type === 'permission') void session.close(); } });
  try {
    session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
    const call = { callId: 'call', toolName: 'opaque', input: {} };
    let reads = 0;
    const result = await session.beforeTool({ ...call, current: () => {
      if (source === 'microtask' && ++reads === 3) queueMicrotask(() => { void session.close(); });
      return { sessionId: 'one', contextId: 'main', ...call };
    } });
    let executions = 0;
    if (result.permission === 'released') executions++;
    assert.equal(result.assessment.wouldDecision, 'ALLOW');
    assert.equal(session.status().state, 'closed'); assert.equal(result.permission, 'blocked'); assert.equal(executions, 0);
  } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
}
console.log('SDK handoff regressions passed');
