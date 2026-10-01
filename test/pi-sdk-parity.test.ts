import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { createGuard, type OwnerRecord, type Outcome } from 'tenet';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';

for (const outcome of ['PASS', 'FAIL', 'APPROVAL_REQUIRED'] as const) {
  test(`Pi and compiled SDK share ${outcome} diagnostics and permission with distinct coverage`, async () => {
    const h = await guardHarness({ env: { TENET_MODE: 'enforce' }, judge: async r => answer(r.policy, outcome) });
    const records: OwnerRecord[] = [];
    const guard = createGuard({ host: 'standalone', capabilities: ['interception', 'result-correlation', 'argument-stability', 'lifecycle-invalidation', 'trusted-approval'],
      env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' }, controlPath: join(h.cwd, 'sdk-control.json'),
      judge: async r => answer(r.policy, outcome as Outcome), onOwnerRecord: r => records.push(r) });
    try {
      await h.start();
      const session = guard.openSession({ sessionId: 's', contextId: 'main' }, h.cwd); await session.ready;
      const call = { callId: 'equivalent', toolName: 'edit', input: { path: 'README.md', text: 'hello' } };
      const result = await session.beforeTool({ ...call, metadata: () => ({ description: 'Edit a file', parameters: {} }),
        current: () => ({ ...call, sessionId: 's', contextId: 'main' }), approve: async () => 'denied-or-dismissed' });
      const native = await h.call(call.callId, call.input);
      assert.equal(!!native?.block, result.permission === 'blocked');
      const piPermission = h.records.findLast(r => r.stage === 'permission');
      const sdkPermission = records.findLast(r => r.stage === 'permission')!.data;
      for (const field of ['outcome', 'wouldDecision', 'reason', 'diagnostics', 'rules', 'approvalRules', 'profile', 'questionVersion']) {
        assert.deepEqual(piPermission[field], sdkPermission[field], field);
      }
      assert.equal(session.status().capabilities.resultCorrelation, true);
      assert.equal(session.status().capabilities.argumentStability, true);
      await h.commands.get('tenet').handler('status', h.ctx);
      assert.match(h.notifications.at(-1)!, /result correlation, argument stability/);
      assert.match(h.notifications.at(-1)!, /target-resolution-unavailable/);
      assert.equal(session.status().capabilities.actionResolution, 'unsupported');
    } finally { await guard.close(); await h.close(); }
  });
}

test('SDK owner records preserve findings without becoming a second recording sink', async () => {
  const h = await guardHarness();
  const records: OwnerRecord[] = [];
  const guard = createGuard({ host: 'owner-records', env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' },
    controlPath: join(h.cwd, 'sdk-control.json'), judge: async r => answer(r.policy, 'FAIL'),
    onOwnerRecord: r => { records.push(r); assert.ok(Object.isFrozen(r.data)); throw new Error('owner delivery failed'); } });
  try {
    const session = guard.openSession({ sessionId: 'records', contextId: 'main' }, h.cwd); await session.ready;
    const call = { callId: 'record', toolName: 'dummy', input: {} };
    const result = await session.beforeTool({ ...call, current: () => ({ ...call, sessionId: 'records', contextId: 'main' }) });
    assert.equal(result.permission, 'blocked');
    assert.match(result.blockReason!, /TENET blocked: rule-failed.*Rules:/s);
    assert.ok(records.some(r => r.stage === 'status'));
    assert.ok(records.some(r => r.stage === 'permission'));
    assert.ok(!records.some(r => ['request', 'response', 'begin'].includes(r.stage)));
    assert.equal(guard.status().capture.kind, 'disabled');
  } finally { await guard.close(); await h.close(); }
});
