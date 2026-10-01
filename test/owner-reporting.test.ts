import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guardHarness } from './guard-harness.js';
import { answer, ruleAnswer } from './helpers.js';

for (const hasUI of [true, false]) test(`owner reporting is bounded and non-intrusive, UI=${hasUI}`, async () => {
  const h = await guardHarness({ hasUI, judge: async request => answer(request.policy, 'FAIL') });
  try {
    await h.start();
    const initialNotifications = h.notifications.length;
    for (let i = 0; i < 102; i++) assert.equal(await h.call(`call-${i}`, { token: 'secret-marker' }), undefined);
    assert.equal(h.notifications.length, initialNotifications, 'no per-call popup');
    const command = h.commands.get('tenet'); assert.ok(command);
    await command.handler('', h.ctx);
    if (hasUI) {
      assert.match(h.statuses.at(-1)!, /OBSERVE.*dropped/);
      assert.match(h.statuses.at(-1)!, /concerns/);
      assert.ok(h.views[0].items.length >= 100 && h.views[0].items.length <= 134);
      assert.ok(h.views[0].items.some((s: string) => s.includes('call-101')));
    } else assert.equal(h.views.length + h.statuses.length + h.notifications.length, 0);
    assert.ok(!JSON.stringify(h.records).includes('secret-marker'));
  } finally { await h.close(); }
});

test('owner details show exact gates and WARN approval without an agent prompt', async () => {
  const h = await guardHarness({ policy: 'Rule; BLOCK; Never commit.\nRule; WARN; Ask before edits.', judge: async request => {
    const raw = answer(request.policy);
    raw.rules[0] = ruleAnswer(raw.rules[0]!.ruleId, 'PASS', 0.63);
    raw.rules[1] = ruleAnswer(raw.rules[1]!.ruleId, 'APPROVAL_REQUIRED');
    return raw;
  } });
  try {
    await h.start(); await h.call(); await h.assessed();
    let selected = false;
    h.ctx.ui.select = async (title, items) => { h.views.push({ title, items }); if (!selected) { selected = true; return items[0] as any; } return undefined; };
    await h.commands.get('tenet').handler('', h.ctx);
    const detail = h.views[1].items.join('\n');
    assert.match(detail, /line 1.*BLOCK/);
    assert.match(h.views[0].items[0], /Never commit\./);
    assert.match(h.views[0].items[0], /Ask before edits\./);
    assert.match(detail, /Never commit\./);
    assert.match(detail, /Ask before edits\./);
    assert.match(detail, /PASS/); assert.match(detail, /0.63/);
    assert.match(detail, /outcome-confidence-below-threshold/);
    assert.match(detail, /line 2.*WARN.*APPROVAL_REQUIRED/);
    assert.equal(h.prompts.length, 0);
  } finally { await h.close(); }
});

test('unavailable evaluation and reporting failure never look like an all-clear', async () => {
  const h = await guardHarness({ judge: async () => { throw new Error('secret'); } });
  try {
    await h.start(); h.pi.appendEntry = () => { throw new Error('disk'); };
    assert.equal(await h.call(), undefined);
    for (let i = 0; !h.statuses.at(-1)?.includes('1 unavailable') && i < 400; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.match(h.statuses.at(-1)!, /1 unavailable/);
    assert.match(h.statuses.at(-1)!, /reporting errors/);
  } finally { await h.close(); }
});


test('mixed approval and uncertainty stay separate from actual observe permission; invalid responses are unavailable', async () => {
  const h = await guardHarness({ policy: 'Rule; BLOCK; Ask before publishing.\nRule; BLOCK; Avoid uncertain reads.', judge: async request => {
    const raw = answer(request.policy);
    raw.rules[0] = ruleAnswer(raw.rules[0]!.ruleId, 'APPROVAL_REQUIRED');
    raw.rules[1] = ruleAnswer(raw.rules[1]!.ruleId, 'PASS', 0.65);
    return raw;
  } });
  try {
    await h.start(); await h.call('mixed'); await h.assessed('mixed');
    assert.match(h.statuses.at(-1)!, /1 distinct calls \(categories overlap:.*1 assessment uncertainty.*1 approval condition/);
    let selected = false;
    h.ctx.ui.select = async (title, items) => { h.views.push({ title, items }); if (!selected) { selected = true; return items[0] as any; } return undefined; };
    await h.commands.get('tenet').handler('', h.ctx);
    assert.match(h.views[0].items[0], /Assessment uncertainty, Approval condition/);
    assert.match(h.views[1].items.join('\n'), /TENET permission: released\nWould enforce: BLOCK/);
    assert.match(h.views[1].items.join('\n'), /outcome-confidence-below-threshold/);
    assert.equal(h.prompts.length, 0);
  } finally { await h.close(); }
});

test('owner-only execution follows a correlated result and survives branch recovery', async () => {
  const h = await guardHarness({ judge: async request => answer(request.policy, 'FAIL') });
  try {
    await h.start(); await h.call('observed');
    await h.emit('tool_result', { toolCallId: 'unrelated', toolName: 'edit', content: 'ignored' });
    await h.emit('tool_result', { toolCallId: 'observed', toolName: 'edit', content: 'secret-result', isError: true });
    let selected = false;
    h.ctx.ui.select = async (title, items) => { h.views.push({ title, items }); if (!selected) { selected = true; return items[0] as any; } return undefined; };
    await h.commands.get('tenet').handler('', h.ctx);
    assert.match(h.views[1].items.join('\n'), /Observed execution: unknown/);
    await h.emit('session_tree');
    selected = false; h.views.length = 0;
    await h.commands.get('tenet').handler('', h.ctx);
    assert.match(h.views[1].items.join('\n'), /Observed execution: unknown/);
    assert.ok(!JSON.stringify(h.records).includes('secret-result'));
  } finally { await h.close(); }
});
for (const recovery of ['live', 'session_start', 'session_tree', 'session_before_fork'] as const) {
  test(`owner findings survive ${recovery} without feeding evaluator evidence`, async () => {
    const requests: any[] = [];
    const h = await guardHarness({ judge: async request => { requests.push(request); return answer(request.policy, 'FAIL'); } });
    try {
      await h.start(); await h.call('before'); await h.assessed('before');
      if (recovery !== 'live') await h.emit(recovery);
      if (recovery === 'session_before_fork') await h.start();
      await h.call('after'); await h.assessed('after');
      assert.ok(!requests.at(-1).trajectory.observations.some((o: any) => o.origin.includes('tenet')));
      await h.commands.get('tenet').handler('', h.ctx);
      assert.equal(h.views.at(-1).items.length, 2);
      const original = [...h.branch];
      h.branch.splice(0, h.branch.length, ...original.filter(e => e.data.callId !== 'before'));
      await h.emit('session_tree');
      await h.commands.get('tenet').handler('', h.ctx);
      assert.equal(h.views.at(-1).items.length, 1);
    } finally { await h.close(); }
  });
}

test('rule text survives recovery, including integrity, without borrowing current policy text', async () => {
  const h = await guardHarness({ policy: 'Rule; WARN; Original rule text.', judge: async request => {
    const result = answer(request.policy, 'FAIL');
    result.rules[result.rules.length - 1] = ruleAnswer(result.rules.at(-1)!.ruleId, 'FAIL');
    return result;
  } });
  try {
    await h.start(); await h.call('original'); await h.assessed('original');
    const permission = h.branch.find(e => e.data.stage === 'permission');
    assert.equal(permission.data.rules[0].text, 'Original rule text.');
    await h.emit('session_tree');
    let selected = false;
    h.ctx.ui.select = async (title, items) => { h.views.push({ title, items }); if (!selected) { selected = true; return items[0] as any; } return undefined; };
    await h.commands.get('tenet').handler('', h.ctx);
    assert.match(h.views[0].items[0], /Original rule text/);
    assert.match(h.views[0].items[0], /Never modify/);
    assert.match(h.views[1].items.join(''), /cannot be overridden by user rules/);
    delete permission.data.rules[0].text;
    await h.emit('session_tree');
    h.views.length = 0; selected = false;
    await h.commands.get('tenet').handler('', h.ctx);
    assert.match(h.views[1].items.join(''), /Rule text unavailable in this record/);
    permission.data.rules[0].text = 'x'.repeat(4097);
    await h.emit('session_tree');
    h.views.length = 0; selected = false;
    await h.commands.get('tenet').handler('', h.ctx);
    assert.deepEqual(h.views[0].items, ['No recent concerns recorded.']);
  } finally { await h.close(); }
});
