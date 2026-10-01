import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unlink, writeFile } from 'node:fs/promises';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';

for (const mode of ['observe', 'enforce'] as const) for (const failure of ['credentials', 'factory', 'policy', 'missing-policy', 'configuration', 'capture', 'invalid-response', 'provider', 'timeout'] as const) {
  test(`${mode}: ${failure} remains an unavailable evaluation, not a passing assessment`, async () => {
    const options: Parameters<typeof guardHarness>[0] = { env: { TENET_MODE: mode } };
    if (failure === 'credentials') options.judge = null;
    if (failure === 'factory') {
      options.createJudge = () => { throw new Error('private construction failure'); };
    }
    if (failure === 'policy') options.policy = 'not a policy';
    if (failure === 'configuration') options.env!.TENET_EFFECT_THRESHOLD = 'invalid';
    if (failure === 'missing-policy') options.env!.TENET_POLICY = 'TENET.md';
    if (failure === 'invalid-response') options.judge = async () => ({ rules: [] });
    if (failure === 'provider') options.judge = async () => { throw new Error('private transport failure'); };
    if (failure === 'timeout') { options.env!.TENET_JUDGE_DEADLINE_MS = '5'; options.judge = () => new Promise(() => {}); }
    const h = await guardHarness(options);
    try {
      if (failure === 'missing-policy') await unlink(h.file);
      await h.start();
      const result = await h.call('failure', failure === 'capture' ? { invalid: undefined } : {});
      assert.equal(result?.block, mode === 'enforce' ? true : undefined);
      if (mode === 'observe' && ['factory', 'invalid-response', 'provider', 'timeout'].includes(failure)) await h.assessed('failure');
      assert.equal(h.prompts.length, 0);
      const permission = h.records.find(r => r.stage === 'permission');
      const background = mode === 'observe' && ['factory', 'invalid-response', 'provider', 'timeout'].includes(failure);
      assert.equal(permission.wouldDecision, mode === 'observe' ? undefined : 'BLOCK');
      if (failure === 'factory') assert.equal(background ? h.records.findLast(r => r.stage === 'assessment-status')?.reason : permission.reason, 'provider-error');
      assert.equal(permission.assessmentAvailable, false);
      assert.deepEqual(permission.diagnostics, []);
      assert.ok(!JSON.stringify(h.records).includes('private '));
    } finally { await h.close(); }
  });
}

for (const event of ['agent_end', 'session_before_switch', 'session_before_fork', 'session_before_tree', 'session_tree', 'session_shutdown', 'cancel', 'arguments', 'policy'] as const) {
  test(`observation during ${event} never vetoes or requests approval`, async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(r => { entered = r; });
    const waiting = new Promise<void>(r => { release = r; });
    const h = await guardHarness({ judge: async request => { entered(); await waiting; return answer(request.policy, 'APPROVAL_REQUIRED'); } });
    try {
      await h.start();
      const input = { text: 'original' };
      const pending = h.call('pending', input);
      await started;
      if (event === 'cancel') h.controller.abort();
      else if (event === 'arguments') input.text = 'changed externally';
      else if (event === 'policy') await writeFile(h.file, 'Rule; Changed');
      else await h.emit(event);
      release();
      assert.equal(await pending, undefined);
      assert.equal(h.prompts.length, 0);
      assert.ok(h.records.some(r => r.stage === 'permission' && r.outcome === 'released' && r.wouldDecision === undefined));
      if (event !== 'session_shutdown') {
        const terminal = await h.assessed('pending');
        assert.equal(terminal.status, ['agent_end', 'cancel', 'arguments'].includes(event) ? 'completed' : 'cancelled');
      }
      if (event === 'policy') assert.equal(await h.call('stale'), undefined);
    } finally { release(); await h.close(); }
  });
}

test('duplicate call identities never fabricate successful correlation', async () => {
  const h = await guardHarness();
  try {
    await h.start();
    assert.equal(await h.call('same'), undefined);
    assert.equal(await h.call('same'), undefined);
    await h.emit('tool_result', { toolName: 'edit', toolCallId: 'same', content: [], isError: false });
    assert.ok(!h.records.some(r => r.stage === 'execution' && r.outcome === 'executed'));
    assert.ok(h.records.some(r => r.stage === 'execution' && r.outcome === 'unknown'));
  } finally { await h.close(); }
});

for (const channel of ['persistence', 'status', 'notify', 'history', 'inventory'] as const) {
  test(`observation survives ${channel} failure without exposing exceptions`, async () => {
    const h = await guardHarness();
    const fail = () => { throw new Error('private-host-error'); };
    try {
      if (channel === 'persistence') h.pi.appendEntry = fail;
      if (channel === 'status') h.ctx.ui.setStatus = fail;
      if (channel === 'notify') h.ctx.ui.notify = fail;
      if (channel === 'history') h.ctx.sessionManager.getBranch = fail;
      if (channel === 'inventory') h.pi.getAllTools = fail;
      await h.start();
      assert.equal(await h.call(), undefined);
      const content = [{ type: 'text', get text() { throw new Error('private-result-error'); } }];
      assert.equal(await h.emit('tool_result', { toolName: 'edit', toolCallId: 'c', content, isError: false }), undefined);
      await h.emit('agent_end');
      await h.start();
      assert.equal(await h.call('again'), undefined);
      assert.ok(!JSON.stringify(h.records).includes('private-'));
    } finally { await h.close(); }
  });
}

test('unavailable observation still disambiguates duplicate IDs and tool results', async () => {
  const h = await guardHarness({ judge: null });
  try {
    await h.start();
    await h.call('duplicate'); await h.call('duplicate');
    await h.emit('tool_result', { toolName: 'edit', toolCallId: 'duplicate', content: [], isError: false });
    assert.ok(!h.records.some(r => r.stage === 'execution' && r.outcome === 'executed'));
    await h.call('failed');
    await h.emit('tool_result', { toolName: 'other-tool', toolCallId: 'failed', content: [], isError: false });
    assert.ok(!h.records.some(r => r.stage === 'execution' && r.callId === 'failed'));
    await h.emit('tool_result', { toolName: 'edit', toolCallId: 'failed', content: [], isError: true });
    assert.equal(h.records.find(r => r.stage === 'execution' && r.callId === 'failed').outcome, 'unknown');
    await h.call('absent'); await h.emit('agent_end');
    assert.equal(h.records.find(r => r.stage === 'execution' && r.callId === 'absent').outcome, 'unknown');
  } finally { await h.close(); }
});

test('observation checks policy freshness even when the assessment would block', async () => {
  const h = await guardHarness({ judge: async request => {
    await writeFile(request.policy.source, 'Rule; Changed externally');
    return answer(request.policy, 'FAIL');
  } });
  try {
    await h.start(); assert.equal(await h.call('first'), undefined);
    assert.equal((await h.assessed('first')).status, 'cancelled');
    assert.equal(await h.call('second'), undefined);
    const permissions = h.records.filter(r => r.stage === 'permission');
    assert.deepEqual(permissions.map(r => r.reason), ['assessment-pending', 'policy-stale']);
    assert.equal(permissions[1].assessmentAvailable, false);
  } finally { await h.close(); }
});
