import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';
import { createJevJudge } from '../src/decision/jev.js';
import { readArchive } from '../src/recording/archive.js';
import { invocationView } from '../src/inspector/view.js';
import { runReplay } from '../eval/replay.js';
import type { Fixture } from '../eval/generic-rule-fixtures.js';
import type { Outcome } from '../src/decision/contracts.js';

const declaration = 'Rule; BLOCK; evidenceThreshold=0.8; Ask before deleting backups.';
for (const mode of ['observe', 'enforce']) for (const severity of ['BLOCK', 'WARN']) {
  test(`threshold preserves ${mode}/${severity} labels, outcome confidence and approval`, async () => {
    let outcome: Outcome = 'PASS', evidence = 0.8, outcomeProbability = 0.97;
    const h = await guardHarness({ policy: declaration.replace('BLOCK', severity), env: { TENET_MODE: mode },
      judge: async request => {
        const a = answer(request.policy, outcome, outcomeProbability);
        a.rules[0]!.evidence = { choice: evidence < 0.5 ? 'INSUFFICIENT' : 'SUFFICIENT', probabilities: { SUFFICIENT: evidence, INSUFFICIENT: 1 - evidence } };
        return a;
      } });
    try {
      await h.start();
      assert.equal(await h.call('boundary'), undefined);
      for (const label of ['FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED'] as const) {
        outcome = label;
        const result = await h.call(label);
        assert.equal(result?.block === true, mode === 'enforce' && severity === 'BLOCK');
      }
      assert.equal(h.prompts.length, mode === 'enforce' && severity === 'BLOCK' ? 1 : 0);
      outcome = 'PASS'; evidence = 0.79;
      assert.equal((await h.call('low-evidence'))?.block === true, mode === 'enforce' && severity === 'BLOCK');
      evidence = 0.2;
      assert.equal((await h.call('insufficient'))?.block === true, mode === 'enforce' && severity === 'BLOCK');
      evidence = 0.8; outcomeProbability = 0.89;
      assert.equal((await h.call('low-outcome'))?.block === true, mode === 'enforce' && severity === 'BLOCK');
      const diagnostics = h.records.flatMap(r => r.diagnostics ?? []);
      assert.ok(diagnostics.some(d => d.evidenceThreshold === 0.8));
      const details: string[] = [];
      h.ctx.ui.select = async (_title: string, items: string[]) => { details.push(...items); return details.length === items.length ? items[0] : undefined; };
      await h.commands.get('tenet').handler('', h.ctx);
      assert.ok(details.includes('Evidence threshold: 0.8'));
    } finally { await h.emit('session_shutdown'); await h.close(); }
  });
}

test('SDK semantic state excludes metadata; archive and inspector retain effective historical thresholds', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-threshold-archive-')));
  const submitted: any[] = [];
  const h = await guardHarness({ policy: declaration, env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: directory },
    createJudge: () => createJevJudge({ apiKey: 'offline', fetch: async (_url, init) => {
      const payload = JSON.parse(init!.body as string); submitted.push(payload);
      assert.equal(payload.state.policy.rules[0].text, 'Ask before deleting backups.');
      assert.ok(!JSON.stringify(payload).includes('evidenceThreshold'));
      const a = answer(payload.state.policy);
      a.rules[0]!.evidence = { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: submitted.length === 1 ? 0.85 : 0.75, INSUFFICIENT: submitted.length === 1 ? 0.15 : 0.25 } };
      return Response.json({ model: 'offline', answers: Object.fromEntries(a.rules.flatMap((r, i) => [
        [`rule_${i}_outcome`, { type: 'choice', ...r.outcome, confidence: 1 }],
        [`rule_${i}_evidence`, { type: 'choice', ...r.evidence, confidence: 1 }],
      ])) });
    } }) });
  try {
    await h.start(); await h.call('pass'); await h.call('block'); await h.emit('session_shutdown');
    const { records } = await readArchive(directory);
    for (const callId of ['pass', 'block']) {
      const invocation = records.filter(r => r.callId === callId);
      const view = invocationView(invocation);
      assert.equal(view.rules[0]!.thresholds.evidenceThreshold, 0.8);
      assert.equal(view.rules[1]!.thresholds.evidenceThreshold, 0.9);
      assert.equal(view.rules[0]!.contribution, callId === 'pass' ? 'pass' : 'blocking-gates');
      const decision = invocation.find(r => r.stage === 'decision')!;
      const contributions = decision.data.contributions as any[];
      assert.equal(contributions[0].evidenceThreshold, 0.8);
      if (callId === 'block') assert.equal((decision.data.diagnostics as any[])[0].evidenceThreshold, 0.8);
      const old = structuredClone(invocation);
      for (const r of old) { delete r.data.contributions; delete r.data.diagnostics; }
      assert.equal(invocationView(old).rules[0]!.thresholds.evidenceThreshold, 0.9);
      for (const r of old) delete r.data.config;
      assert.equal(invocationView(old).rules[0]!.thresholds.evidenceThreshold, null);
    }
    const historical = invocationView(records.filter(r => r.callId === 'pass'));
    await import('node:fs/promises').then(fs => fs.writeFile(h.file, 'Rule; BLOCK; evidenceThreshold=0.95; Changed rule.'));
    assert.deepEqual(invocationView(records.filter(r => r.callId === 'pass')), historical);
    assert.deepEqual(submitted[0].questions, submitted[1].questions);
  } finally { await h.close(); await rm(directory, { recursive: true, force: true }); }
});

test('offline replay reports mixed effective thresholds even for passing rules', async () => {
  const fixture: Fixture = { id: 'thresholds', rules: ['Never delete backups.', 'Ask before installing dependencies.'],
    evidenceThresholds: [0.8, undefined], outcomes: ['PASS', 'PASS'], integrity: 'PASS', expectedDecision: 'BLOCK',
    input: { toolName: 'read', arguments: {} } };
  const report = await runReplay({ fixtures: [fixture], judge: async request => {
    const a = answer(request.policy);
    for (const r of a.rules.slice(0, 2)) r.evidence = { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 0.85, INSUFFICIENT: 0.15 } };
    return a;
  } });
  assert.equal(report.passed, 1);
  assert.deepEqual(report.rows[0]!.contributions?.map(r => r.evidenceThreshold), [0.8, 0.9, 0.9]);
  assert.equal(report.rows[0]!.execution, 'not-executed');
});
