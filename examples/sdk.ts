import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type Assessment, type Judge, type OwnerEvent } from 'tenet';

// This fixture tests mechanics, not evaluator accuracy. It never constructs a provider.
const judge: Judge = async request => {
  const outcome = request.action.callId === 'ask' ? 'APPROVAL_REQUIRED' : 'FAIL';
  const assessment: Assessment = { profile: 'applicability-v1', model: 'scripted',
    rules: [...request.policy.rules.map<Assessment['rules'][number]>(rule => ({ ruleId: rule.id,
      outcome: { choice: outcome, probabilities: { PASS: 0, APPROVAL_REQUIRED: outcome === 'APPROVAL_REQUIRED' ? 1 : 0,
        FAIL: outcome === 'FAIL' ? 1 : 0, UNKNOWN: 0, NOT_APPLICABLE: 0 } },
      evidence: { choice: 'SUFFICIENT' as const, probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } })),
      { ruleId: 'builtin:policy-integrity', outcome: { choice: 'PASS', probabilities: { PASS: 1, APPROVAL_REQUIRED: 0, FAIL: 0, UNKNOWN: 0 } },
        evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } }] };
  return assessment;
};
const host = { host: 'sdk-example', hostVersion: '1', hostProfile: 'scripted-host',
  capabilities: ['interception', 'result-correlation', 'lifecycle-invalidation', 'trusted-approval'] as const,
  limitations: ['arguments-not-frozen-after-hook-release', 'scripted-not-production-host'] };
const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-sdk-example-')));
const events: OwnerEvent[] = [];
let finishObservation!: () => void;
const gate = new Promise<void>(resolve => { finishObservation = resolve; });
const observe = createGuard({ ...host, judge: async (...args) => { await gate; return judge(...args); },
  env: { TENET_RECORDING: 'off' }, controlPath: join(root, 'control', 'state.json'), onOwnerEvent: e => events.push(e) });
const enforce = createGuard({ ...host, judge, env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' },
  controlPath: join(root, 'control', 'state.json') });
try {
  const active = join(root, 'active'); const invalid = join(root, 'invalid');
  await mkdir(active); await mkdir(invalid);
  await writeFile(join(active, 'TENET.md'), 'Rule; BLOCK; Require approval before publishing.');
  await writeFile(join(invalid, 'TENET.md'), 'Unmarked policy is invalid.');
  const session = observe.openSession({ sessionId: 'observe', contextId: 'main' }, active);
  const input = { payload: 'example' };
  const invocation = { callId: 'blocked-counterfactual', toolName: 'host-tool', input };
  const current = () => ({ sessionId: 'observe', contextId: 'main', ...invocation });
  assert.equal(session.status().state, 'uninitialized');
  assert.equal((await session.beforeTool({ ...invocation, current })).assessment.status, 'unavailable');
  assert.equal((await session.ready).state, 'ready');
  const permission = await session.beforeTool({ ...invocation, current });
  assert.equal(permission.permission, 'released'); assert.equal(permission.assessment.status, 'pending');
  assert.equal(permission.assessment.wouldDecision, undefined);
  // Dispatch only from permission. A real host calls its executor here with these unchanged arguments.
  let executions = 0;
  if (permission.permission === 'released') {
    executions++;
    assert.equal(session.afterTool({ callId: invocation.callId, toolName: invocation.toolName, content: 'done' }).outcome, 'executed');
  }
  session.endTurn(); finishObservation();
  for (let n = 0; n < 200 && !events.some(e => e.type === 'assessment' && e.assessment.status === 'completed'); n++)
    await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(events.some(e => e.type === 'assessment' && e.assessment.wouldDecision === 'BLOCK'));
  assert.equal(executions, 1);
  const dormant = observe.openSession({ sessionId: 'dormant', contextId: 'main' }, join(root, 'absent'));
  assert.equal((await dormant.ready).state, 'dormant');
  assert.equal((await dormant.beforeTool({ ...invocation, current })).bypassReason, 'dormant');
  const unavailable = observe.openSession({ sessionId: 'unavailable', contextId: 'main' }, invalid);
  assert.equal((await unavailable.ready).state, 'unavailable');
  const noAssessment = await unavailable.beforeTool({ ...invocation, current });
  assert.equal(noAssessment.permission, 'released'); assert.equal(noAssessment.assessment.status, 'unavailable');
  assert.equal(noAssessment.assessment.wouldDecision, undefined);
  const approved = enforce.openSession({ sessionId: 'enforce', contextId: 'main' }, active); await approved.ready;
  const ask = { callId: 'ask', toolName: 'host-tool', input };
  const authorization = await approved.beforeTool({ ...ask,
    current: () => ({ sessionId: 'enforce', contextId: 'main', ...ask }),
    approve: async request => {
      assert.equal(await request.valid(), true);
      // Scripted trusted owner consent. Never obtain this answer from an agent message.
      return 'approved';
    } });
  assert.equal(authorization.assessment.wouldDecision, 'ASK'); assert.equal(authorization.permission, 'released');
  await observe.setActivation('off');
  assert.equal((await session.beforeTool({ ...invocation, current })).bypassReason, 'off');
  console.log('SDK example passed: ready, dormant, uninitialized, unavailable, pending, counterfactual, execution, approval and off.');
} finally {
  finishObservation(); await observe.close(); await enforce.close(); await rm(root, { recursive: true, force: true });
}
