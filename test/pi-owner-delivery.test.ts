import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActionResolver } from 'tenet';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';

const resolver = (failsAt: 'capture' | 'revalidate'): ActionResolver => ({
  id: 'owner-test', version: '1', semantics: ['opaque'],
  resolve: async ({ binding }) => {
    if (failsAt === 'capture') throw new Error('private-resolver-error');
    return { version: 1, binding, integration: { id: 'owner-test', version: '1' }, resolverState: 'one', coverage: 'complete',
      operations: [{ id: 'one', semantics: 'opaque', resources: [], content: [] }], limitations: [] };
  },
  revalidate: async () => null,
});

for (const scenario of ['denied', 'dismissed', 'ui-error', 'capture', 'revalidate'] as const) {
  test(`native owner retains ${scenario} finding live and after recovery`, async () => {
    const resolution = scenario === 'capture' || scenario === 'revalidate';
    const h = await guardHarness({ env: { TENET_MODE: 'enforce' }, actionResolver: resolution ? resolver(scenario) : undefined,
      judge: async request => answer(request.policy, resolution ? 'PASS' : 'APPROVAL_REQUIRED') });
    const reason = resolution ? scenario === 'capture' ? 'action-resolution-unavailable' : 'action-resolution-stale'
      : scenario === 'ui-error' ? 'approval-ui-error' : 'approval-denied-or-dismissed';
    try {
      await h.start();
      h.ctx.ui.confirm = async () => {
        if (scenario === 'ui-error') throw new Error('private-ui-error');
        return scenario === 'dismissed' ? undefined as any : false;
      };
      let executed = 0;
      const permission = await h.call(scenario);
      if (!permission?.block) executed++;
      assert.equal(executed, 0);
      assert.match(permission.reason, new RegExp(reason));
      for (const recovery of ['live', 'session_tree', 'session_start']) {
        if (recovery !== 'live') await h.emit(recovery);
        let selected = false; h.views.length = 0;
        h.ctx.ui.select = async (title, items) => { h.views.push({ title, items }); if (!selected) { selected = true; return items[0]; } return undefined; };
        await h.commands.get('tenet').handler('', h.ctx);
        assert.equal(h.views[0].items.length, 1);
        assert.notEqual(h.views[0].items[0], 'No recent concerns recorded.', recovery);
        assert.match(h.views[1].items.join('\n'), new RegExp(`Reason: "${reason}"`), recovery);
        assert.match(h.statuses.filter(s => s.startsWith('TENET ON')).at(-1)!, /1 distinct calls/, recovery);
        if (!resolution) {
          assert.match(h.views[1].items.join('\n'), /APPROVAL_REQUIRED/);
          assert.match(h.statuses.filter(s => s.startsWith('TENET ON')).at(-1)!, /1 approval condition/);
        }
      }
      assert.doesNotMatch(JSON.stringify(h.records), /private-ui-error|private-resolver-error/);
    } finally { await h.close(); }
  });
}

test('enforce transcript append failure withholds execution but retains independent owner finding', async () => {
  const h = await guardHarness({ env: { TENET_MODE: 'enforce' }, judge: async request => answer(request.policy, 'FAIL') });
  try {
    await h.start(); h.pi.appendEntry = () => { throw new Error('disk'); };
    let executed = 0;
    const permission = await h.call('append-failed');
    if (!permission?.block) executed++;
    assert.equal(executed, 0);
    assert.match(permission.reason, /rule-failed/);
    let selected = false;
    h.ctx.ui.select = async (title, items) => { h.views.push({ title, items }); if (!selected) { selected = true; return items[0]; } return undefined; };
    await h.commands.get('tenet').handler('', h.ctx);
    assert.match(h.views[0].items[0], /append-failed/);
    assert.match(h.views[1].items.join('\n'), /rule-fail/);
    assert.match(h.statuses.filter(s => s.startsWith('TENET ON')).at(-1)!, /1 concerns.*1 distinct calls.*reporting errors/);
    assert.ok(!h.records.some(r => r.stage === 'permission'));
  } finally { await h.close(); }
});

test('SDK permission supersession updates one native finding after owner delivery changes arguments', async () => {
  const h = await guardHarness({ env: { TENET_MODE: 'enforce' }, judge: async request => answer(request.policy, 'APPROVAL_REQUIRED') });
  try {
    await h.start(); h.ctx.ui.confirm = async () => true;
    const input = { text: 'original' }; let changed = false;
    h.ctx.ui.setStatus = (_key, value) => {
      h.statuses.push(value ?? '');
      if (!changed && value?.includes('1 distinct calls')) { changed = true; input.text = 'changed-after-owner-delivery'; }
      return h.statuses.length;
    };
    const permission = await h.call('superseded', input);
    assert.equal(changed, true);
    assert.equal(permission.block, true);
    assert.match(permission.reason, /guard-state-changed/);
    await h.commands.get('tenet').handler('', h.ctx);
    assert.equal(h.views[0].items.length, 1);
    assert.match(h.statuses.filter(s => s.startsWith('TENET ON')).at(-1)!, /1 distinct calls/);
    assert.ok(!h.records.some(r => r.stage === 'permission' && r.outcome === 'released'));
  } finally { await h.close(); }
});
