import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guardHarness } from './guard-harness.js';
import { answer, ruleAnswer } from './helpers.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';

for (const [value, mode] of [[undefined, 'observe'], ['observe', 'observe'], ['enforce', 'enforce'], ['typo', 'observe']] as const) {
  test(`startup fixes mode ${value ?? 'default'} before fallible configuration`, async () => {
    const env: Record<string, string> = { TENET_EFFECT_THRESHOLD: 'invalid', ...(value === undefined ? {} : { TENET_MODE: value }) };
    const h = await guardHarness({ env });
    try {
      await h.start();
      assert.equal(h.records.find(r => r.stage === 'status').mode, mode);
      assert.ok(h.statuses.some(s => s.includes(mode.toUpperCase())));
      if (value === 'typo') assert.ok(h.notifications.some(s => s.includes('invalid-mode')));
      env.TENET_MODE = mode === 'observe' ? 'enforce' : 'observe';
      await h.start();
      assert.equal(h.records.filter(r => r.stage === 'status').at(-1).mode, mode);
    } finally { await h.close(); }
  });
}

for (const outcome of ['FAIL', 'APPROVAL_REQUIRED', 'UNKNOWN', 'integrity', 'scores', 'boundary', 'unavailable'] as const) {
  test(`observation permits ${outcome} and records counterfactual separately`, async () => {
    const h = await guardHarness({ policy: 'Rule; BLOCK; Never commit.\nRule; BLOCK; Keep edits focused.', judge: async request => {
      if (outcome === 'unavailable') throw new Error('private-provider-secret');
      const raw = answer(request.policy, ['FAIL', 'APPROVAL_REQUIRED', 'UNKNOWN'].includes(outcome) ? outcome as 'FAIL' | 'APPROVAL_REQUIRED' | 'UNKNOWN' : 'PASS');
      if (outcome === 'integrity') raw.rules[2] = ruleAnswer(INTEGRITY_ID, 'FAIL');
      if (outcome === 'scores') {
        raw.rules[0] = ruleAnswer(raw.rules[0]!.ruleId, 'PASS', 0.63);
        raw.rules[1]!.evidence.probabilities = { SUFFICIENT: 0.89, INSUFFICIENT: 0.11 };
      }
      if (outcome === 'boundary') for (const r of raw.rules) {
        r.outcome = ruleAnswer(r.ruleId, 'PASS', 0.90).outcome;
        r.evidence.probabilities = { SUFFICIENT: 0.90, INSUFFICIENT: 0.10 };
      }
      return raw;
    } });
    try {
      await h.start();
      const input = { path: 'README.md', text: 'hello', token: 'hidden-credential' };
      assert.equal(await h.call('c', input), undefined);
      assert.deepEqual(input, { path: 'README.md', text: 'hello', token: 'hidden-credential' });
      assert.equal(h.prompts.length, 0);
      const lifecycle = await h.assessed('c');
      assert.equal(lifecycle.status, outcome === 'unavailable' ? 'unavailable' : 'completed');
      const report = h.records.find(r => r.stage === 'permission');
      assert.equal(report.version, 3);
      assert.equal(report.mode, 'observe');
      assert.equal(report.outcome, 'released');
      assert.equal(report.wouldDecision, undefined);
      assert.equal(report.assessmentAvailable, false);
      const decision = h.records.find(r => r.stage === 'decision');
      assert.equal(decision?.decision, outcome === 'unavailable' ? undefined : outcome === 'APPROVAL_REQUIRED' ? 'ASK' : outcome === 'boundary' ? 'ALLOW' : 'BLOCK');
      if (outcome === 'scores') {
        assert.deepEqual(decision.diagnostics.map((d: any) => d.gates), [['outcome-confidence-below-threshold'], ['evidence-confidence-below-threshold']]);
        assert.equal(decision.diagnostics[0].outcomeProbability, 0.63);
        assert.equal(decision.diagnostics[1].evidenceProbability, 0.89);
      }
      if (outcome === 'unavailable' || outcome === 'boundary') assert.deepEqual(decision?.diagnostics ?? [], []);
      assert.ok(!JSON.stringify(h.records).includes('hidden-credential'));
      assert.ok(!JSON.stringify(h.records).includes('private-provider-secret'));
      assert.ok(!h.records.some(r => r.stage === 'execution'));
      await h.emit('tool_result', { toolName: 'edit', toolCallId: 'c', content: [{ type: 'text', text: 'done' }], isError: false });
      assert.equal(h.records.find(r => r.stage === 'execution').outcome, 'unknown');
    } finally { await h.close(); }
  });
}
