import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';
import { readArchive } from '../src/recording/archive.js';
import { invocationView } from '../src/inspector/view.js';
import { recoverReport } from '../src/pi/report-history.js';

for (const mode of ['observe', 'enforce'] as const) test(`${mode}: precision failure survives owner recovery and archive reading without a violation`, async () => {
  const h = await guardHarness({ env: { TENET_MODE: mode, TENET_RECORDING: 'on' }, judge: async request => {
    const raw = answer(request.policy);
    raw.rules[0]!.outcome.probabilities = { PASS: 0.89, FAIL: 0.1, UNKNOWN: 0, APPROVAL_REQUIRED: 0, NOT_APPLICABLE: 0 };
    return raw;
  } });
  try {
    await h.start();
    assert.equal((await h.call('precision'))?.block, mode === 'enforce' ? true : undefined);
    if (mode === 'observe') assert.equal((await h.assessed('precision')).status, 'unavailable');
    const details: string[][] = [];
    h.ctx.ui.select = async (title, items) => {
      if (title.includes('Esc to close')) { details.push(items); return undefined; }
      return items[0];
    };
    await h.commands.get('tenet').handler('', h.ctx);
    await h.emit('session_shutdown');
    await h.start();
    await h.commands.get('tenet').handler('', h.ctx);
    assert.equal(details.length, 2);
    for (const rows of details) {
      assert.match(rows.join(''), /Precision accommodation is unsupported/);
      assert.match(rows.join(''), /Evaluator unavailable/);
      assert.doesNotMatch(rows.join(''), /Suspected violation/);
    }
    const archive = await readArchive(join(h.cwd, 'archive'));
    const records = archive.records.filter(r => r.callId === 'precision');
    const view = invocationView(records);
    assert.equal(view.validationIssue, 'unit-sum');
    assert.deepEqual(view.categories, ['unavailable']);
    assert.equal(view.decision, mode === 'enforce' ? 'BLOCK' : 'unavailable');
    assert.equal(view.permission, mode === 'enforce' ? 'blocked' : 'released');
    assert.ok(view.rules.every(r => r.result === null));
    const historical = structuredClone(records);
    for (const r of historical) delete r.data.validationIssue;
    const before = JSON.stringify(historical);
    const old = invocationView(historical);
    assert.equal(old.validationIssue, undefined);
    assert.equal(old.decision, view.decision);
    assert.equal(JSON.stringify(historical), before);
    if (mode === 'enforce') {
      const entry = h.branch.find(e => e.data.stage === 'permission');
      assert.equal(recoverReport(entry)?.validationIssue, 'unit-sum');
      entry.data.validationIssue = 'secret provider prose';
      assert.equal(recoverReport(entry)?.validationIssue, undefined);
    }
  } finally { await h.close(); }
});
