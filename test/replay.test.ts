import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { FIXTURES, fixturePolicy } from '../eval/generic-rule-fixtures.js';
import { runReplay } from '../eval/replay.js';
import { answer, ruleAnswer } from './helpers.js';
import { reportedAssessment } from './reported-assessments.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('replay reports repeated decisions, independent error counts, input identity and exact gates', async () => {
  let calls = 0;
  const fixtures = FIXTURES['local-work'];
  const report = await runReplay({ fixtures, repetitions: 2, judge: async request => {
    calls++;
    const fixture = fixtures.find(f => request.action.callId.startsWith(`${f.id}:`))!;
    if (fixture.id === 'reported-inspection') return reportedAssessment(0);
    if (fixture.id === 'actual-commit') return answer(request.policy);
    if (fixture.id === 'publication-needs-approval') return answer(request.policy, 'UNKNOWN');
    return { model: 'scripted-control', rules: [...fixture.outcomes.map((outcome, i) => ruleAnswer(request.policy.rules[i]!.id, outcome)), ruleAnswer(INTEGRITY_ID, fixture.integrity)] };
  } });
  assert.equal(calls, 14); assert.equal(report.total, 14); assert.equal(report.passed, 8);
  assert.equal(report.repetitions, 2);
  assert.deepEqual(report.summary, {
    falseBlocks: { count: 2, denominator: 6 },
    unsafeAllows: { count: 2, denominator: 8 },
    otherDecisionMismatches: { count: 2, denominator: 14 },
  });
  const rows = report.rows.filter(row => row.id === 'reported-inspection');
  assert.deepEqual(rows.map(row => row.repetition), [1, 2]);
  assert.equal(rows[0]!.fixtureDigest, rows[1]!.fixtureDigest);
  assert.equal(rows[0]!.questionDigest, digest(rows[0]!.questions));
  assert.match(rows[0]!.fixtureDigest, /^[0-9a-f]{64}$/);
  assert.equal(rows[0]!.result.questionVersion, 'policy-rules-v2');
  assert.equal(rows[0]!.result.requestedModel, 'jev-latest');
  assert.equal(rows[0]!.result.assessment?.model, 'jev-offline');
  assert.equal(rows[0]!.result.config.effectThreshold, 0.9);
  assert.equal(rows[0]!.result.config.evidenceThreshold, 0.9);
  assert.deepEqual(rows[0]!.result.diagnostics[0]!.gates, ['outcome-confidence-below-threshold']);
  assert.equal(rows[0]!.expectedDecision, 'ALLOW'); assert.equal(rows[0]!.result.decision, 'BLOCK');
});

test('fixture digest includes metadata and policy, not repetition identity', async () => {
  const fixture = FIXTURES['local-work'][0]!;
  const variants = [fixture, { ...fixture, input: { ...fixture.input, description: 'Different metadata' } },
    { ...fixture, rules: ['Never commit code.'] }];
  const report = await runReplay({ fixtures: variants, judge: async request => answer(request.policy) });
  assert.equal(new Set(report.rows.map(row => row.fixtureDigest)).size, 3);
  assert.deepEqual(report.rows[0]!.policy, fixturePolicy(fixture));
});

test('replay rejects unbounded repetitions before invoking judge', async () => {
  for (const repetitions of [0, -1, 1.5, 21, Infinity, NaN]) {
    let calls = 0;
    await assert.rejects(runReplay({ fixtures: FIXTURES['local-work'], repetitions, judge: async () => { calls++; return {}; } }), /repetitions/);
    assert.equal(calls, 0);
  }
});
