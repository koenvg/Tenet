import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invocationView } from '../src/inspector/view.js';
import { explainDecision, orderedRules, gateExplanation } from '../inspector/src/presentation.js';

const fixture = (decision = 'BLOCK') => invocationView([
  { stage: 'begin', data: { policy: { rules: [
    { id: 'pass', text: 'Pass', line: 1, enforcement: 'BLOCK' },
    { id: 'low', text: 'Low confidence', line: 2, enforcement: 'BLOCK' },
  ] } } },
  { stage: 'assessment', data: { assessment: { rules: [
    { ruleId: 'low', outcome: { choice: 'PASS', probabilities: { PASS: .88 } } },
  ] } } },
  { stage: 'decision', data: { decision, reason: 'insufficient-evidence', contributions: [
    { ruleId: 'pass', contribution: 'pass', gates: [] },
    { ruleId: 'low', contribution: 'blocking-gates', gates: ['outcome-confidence-below-threshold'], effectThreshold: .9 },
  ] } },
] as any);

test('decision explanation cites recorded gate and exact values without calling PASS a violation', () => {
  const view = fixture();
  assert.match(explainDecision(view), /PASS selected at 0.88; required confidence 0.9/);
  assert.ok(!explainDecision(view).includes('violation'));
  assert.deepEqual(orderedRules(view.rules).map(r => r.id), ['low', 'pass']);
  assert.deepEqual(view.rules.map(r => r.id), ['pass', 'low'], 'presentation never mutates the snapshot');
});

test('missing or unrecognized records remain explicit, never inferred from a probability', () => {
  const view = fixture();
  const rule = view.rules[1]!;
  assert.equal(gateExplanation('future-gate', rule), 'Unrecognized recorded gate: future-gate');
  rule.gateIds = null; rule.contribution = 'unavailable';
  assert.match(explainDecision(view), /insufficient-evidence/);
  assert.match(explainDecision(view), /not recorded/);
  assert.ok(!explainDecision(view).includes('0.88'));
});
