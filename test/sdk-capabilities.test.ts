import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type Capability, type GuardOptions } from 'tenet';
import { answer } from './helpers.js';

async function fixture(options: Partial<GuardOptions> = {}) {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-capabilities-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Require approval before publishing.');
  const guard = createGuard({ host: 'capability-test', judge: async r => answer(r.policy),
    env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' }, controlPath: join(cwd, 'control', 'state.json'), ...options });
  const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd);
  await session.ready;
  const invocation = { callId: 'call', toolName: 'opaque', input: { command: 'publish' } };
  const current = () => ({ sessionId: 'one', contextId: 'main', ...invocation });
  return { guard, session, invocation, current,
    close: async () => { await guard.close(); await rm(cwd, { recursive: true, force: true }); } };
}

test('omitted capability list declares no coverage and does not disable assessment', async () => {
  const h = await fixture();
  try {
    const coverage = h.session.status().capabilities;
    assert.equal(coverage.host, 'capability-test'); assert.equal(coverage.version, null); assert.equal(coverage.profile, null);
    for (const name of ['interception', 'resultCorrelation', 'lifecycleInvalidation', 'argumentStability', 'trustedApproval'] as const)
      assert.equal(coverage[name], false);
    assert.equal(coverage.actionResolution, 'unsupported');
    const result = await h.session.beforeTool({ ...h.invocation, current: h.current });
    assert.equal(result.permission, 'released'); assert.equal(result.assessment.wouldDecision, 'ALLOW');
    assert.equal(h.session.afterTool(h.invocation).outcome, 'unknown');
  } finally { await h.close(); }
});

for (const [capability, field] of [
  ['interception', 'interception'], ['result-correlation', 'resultCorrelation'],
  ['lifecycle-invalidation', 'lifecycleInvalidation'], ['argument-stability', 'argumentStability'],
  ['trusted-approval', 'trustedApproval'],
] as const) {
  test(`only the declared ${capability} guarantee is enabled`, async () => {
    const h = await fixture({ capabilities: [capability], hostVersion: '1.2', hostProfile: 'scripted', limitations: ['test-host'] });
    try {
      const coverage = h.session.status().capabilities;
      assert.equal(coverage[field], true);
      for (const name of ['interception', 'resultCorrelation', 'lifecycleInvalidation', 'argumentStability', 'trustedApproval'] as const)
        assert.equal(coverage[name], name === field);
      assert.equal(coverage.version, '1.2'); assert.equal(coverage.profile, 'scripted');
      assert.ok(coverage.limitations.includes('test-host')); assert.equal(coverage.actionResolution, 'unsupported');
      await h.session.beforeTool({ ...h.invocation, current: h.current });
      assert.equal(h.session.afterTool(h.invocation).outcome, capability === 'result-correlation' ? 'executed' : 'unknown');
    } finally { await h.close(); }
  });
}

test('mutable options or an approval callback cannot upgrade undeclared trusted approval', async () => {
  const capabilities: Capability[] = ['interception'];
  const limitations = ['no-ui'];
  const h = await fixture({ capabilities, limitations, judge: async r => answer(r.policy, 'APPROVAL_REQUIRED') });
  try {
    capabilities.push('trusted-approval'); limitations.push('changed');
    let approvals = 0;
    const result = await h.session.beforeTool({ ...h.invocation, current: h.current,
      approve: async () => { approvals++; return 'approved'; } });
    assert.equal(result.permission, 'blocked'); assert.equal(result.assessment.wouldDecision, 'ASK');
    assert.equal(approvals, 0); assert.equal(h.session.status().capabilities.trustedApproval, false);
    assert.equal(h.session.status().capabilities.limitations.includes('changed'), false);
  } finally { await h.close(); }
});

test('trusted-approval declaration still requires invocation-local UI consent', async () => {
  const h = await fixture({ capabilities: ['trusted-approval'], judge: async r => answer(r.policy, 'APPROVAL_REQUIRED') });
  try {
    assert.equal((await h.session.beforeTool({ ...h.invocation, current: h.current })).permission, 'blocked');
    const retry = { ...h.invocation, callId: 'retry' };
    assert.equal((await h.session.beforeTool({ ...retry,
      current: () => ({ sessionId: 'one', contextId: 'main', ...retry }), approve: async () => 'approved' })).permission, 'released');
  } finally { await h.close(); }
});

test('malformed and unknown capabilities are rejected instead of inferred', () => {
  for (const capabilities of [null, new Array(1), 'trusted-approval', { trustedApproval: true }, ['trustedApproval'],
    ['result-correlation', false], ['authenticated-action-resolution'], ['interception', 'interception']]) {
    assert.throws(() => createGuard({ host: 'test', capabilities } as unknown as GuardOptions), /capabilit/);
  }
});
