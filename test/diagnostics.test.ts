import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Assessment, Config } from '../src/decision/contracts.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { fixturePolicy, FIXTURE_CWD, REPORTED_FIXTURES } from '../eval/generic-rule-fixtures.js';
import { reportedAssessment } from './reported-assessments.js';
import { answer, policy } from './helpers.js';

const action = captureAction({ sessionId: 'test', callId: 'test', toolName: 'read', arguments: { path: 'README.md' } });
const evaluate = (assessment: Assessment, config?: Partial<Config>) => decide({ policy, action, cwd: '/synthetic', judge: async () => assessment, config });

for (const index of [0, 1] as const) {
  test(`reported ${index}: diagnostics distinguish every blocking gate`, async () => {
    const fixture = REPORTED_FIXTURES[index];
    const selected = fixturePolicy(fixture);
    const result = await decide({ policy: selected, action, cwd: FIXTURE_CWD, judge: async () => reportedAssessment(index) });
    assert.deepEqual(result.diagnostics, index === 0 ? [{
      ruleId: selected.rules[1]!.id, enforcement: 'BLOCK', gates: ['outcome-confidence-below-threshold'],
      outcome: 'PASS', outcomeProbability: 0.88, evidence: 'SUFFICIENT', evidenceProbability: 0.93,
      effectThreshold: 0.9, evidenceThreshold: 0.9,
    }] : [{
      ruleId: selected.rules[1]!.id, enforcement: 'BLOCK', gates: ['rule-fail', 'outcome-confidence-below-threshold'],
      outcome: 'FAIL', outcomeProbability: 0.58, evidence: 'SUFFICIENT', evidenceProbability: 0.9,
      effectThreshold: 0.9, evidenceThreshold: 0.9,
    }, {
      ruleId: 'builtin:policy-integrity', enforcement: 'BLOCK', gates: ['outcome-confidence-below-threshold', 'evidence-confidence-below-threshold'],
      outcome: 'PASS', outcomeProbability: 0.88, evidence: 'SUFFICIENT', evidenceProbability: 0.87,
      effectThreshold: 0.9, evidenceThreshold: 0.9,
    }]);
  });
}

test('UNKNOWN and insufficient evidence retain simultaneous independent gates', async () => {
  const assessment = answer(policy, 'UNKNOWN', 0.8);
  assessment.rules[0]!.evidence = { choice: 'INSUFFICIENT', probabilities: { SUFFICIENT: 0.2, INSUFFICIENT: 0.8 } };
  const result = await evaluate(assessment);
  assert.equal(result.decision, 'BLOCK');
  assert.deepEqual(result.diagnostics[0]!.gates, ['outcome-unknown', 'outcome-confidence-below-threshold', 'evidence-insufficient', 'evidence-confidence-below-threshold']);
  assert.equal(result.diagnostics[0]!.evidenceProbability, 0.2);
});

test('exact thresholds pass, custom thresholds govern diagnostics and low-confidence FAIL still blocks', async () => {
  const assessment = answer(policy, 'PASS', 0.9);
  assessment.rules[0]!.evidence = { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 0.9, INSUFFICIENT: 0.1 } };
  const boundary = await evaluate(assessment);
  assert.equal(boundary.decision, 'ALLOW'); assert.deepEqual(boundary.diagnostics, []);
  const stricter = await evaluate(assessment, { effectThreshold: 0.95, evidenceThreshold: 0.95 });
  assert.deepEqual(stricter.diagnostics[0]!.gates, ['outcome-confidence-below-threshold', 'evidence-confidence-below-threshold']);
  assert.equal(stricter.diagnostics[0]!.effectThreshold, 0.95); assert.equal(stricter.diagnostics[0]!.evidenceThreshold, 0.95);
  const fail = await evaluate(answer(policy, 'FAIL', 0.58), { effectThreshold: 0.5 });
  assert.equal(fail.decision, 'BLOCK'); assert.equal(fail.reason, 'rule-failed');
  assert.deepEqual(fail.diagnostics[0]!.gates, ['rule-fail']);
});

test('missing or invalid assessments do not fabricate scores', async () => {
  for (const judge of [async () => { throw new Error('private exception'); }, async () => ({ rules: [] })]) {
    const result = await decide({ policy, action, cwd: '/synthetic', judge });
    assert.equal(result.decision, 'BLOCK'); assert.equal(result.assessment, null);
    assert.deepEqual(result.diagnostics, []);
    assert.ok(!JSON.stringify(result).includes('private exception'));
  }
});
