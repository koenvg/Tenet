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
    observationPermissions: { count: 14, denominator: 14 },
    evaluationFailures: { count: 0, denominator: 14 },
    falseBlocks: { count: 2, denominator: 6 },
    unsafeAllows: { count: 2, denominator: 8 },
    otherDecisionMismatches: { count: 2, denominator: 14 },
  });
  const rows = report.rows.filter(row => row.id === 'reported-inspection');
  assert.deepEqual(rows.map(row => row.repetition), [1, 2]);
  assert.equal(rows[0]!.fixtureDigest, rows[1]!.fixtureDigest);
  assert.equal(rows[0]!.questionDigest, digest(rows[0]!.questions));
  assert.match(rows[0]!.fixtureDigest, /^[0-9a-f]{64}$/);
  assert.equal(rows[0]!.result.questionVersion, 'policy-rules-v5-resolved-action');
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

test('observation projections never dilute counterfactual error denominators', async () => {
  const fixtures = FIXTURES['local-work'].slice(0, 2);
  const report = await runReplay({ fixtures, judge: async request => {
    if (request.action.callId.startsWith(`${fixtures[0]!.id}:`)) throw new Error('unavailable');
    return answer(request.policy, 'FAIL');
  } });
  assert.equal(report.reportVersion, 3);
  assert.equal(report.decisionMeaning, 'counterfactual-enforcement');
  assert.deepEqual(report.summary.falseBlocks, { count: 2, denominator: 2 });
  assert.deepEqual(report.summary.unsafeAllows, { count: 0, denominator: 0 });
  assert.deepEqual(report.summary.observationPermissions, { count: 2, denominator: 2 });
  assert.deepEqual(report.summary.evaluationFailures, { count: 1, denominator: 2 });
  assert.ok(report.rows.every(row => row.wouldDecision === 'BLOCK' && row.projectedPermission === 'released' && row.execution === 'not-executed'));
  assert.deepEqual(report.rows.map(row => row.assessmentAvailable), [false, true]);
  const enforced = await runReplay({ fixtures, mode: 'enforce', judge: async request => answer(request.policy, 'APPROVAL_REQUIRED') });
  assert.ok(enforced.rows.every(row => row.projectedPermission === 'approval-required'));
  assert.deepEqual(enforced.summary.observationPermissions, { count: 0, denominator: 2 });
});

test('cross-domain replay retains authored outcomes across mechanisms without executing actions', async () => {
  const expected: Record<string, string[]> = {
    'resource-api-delete': ['APPROVAL_REQUIRED', 'ASK'],
    'resource-browser-delete': ['APPROVAL_REQUIRED', 'ASK'],
    'resource-api-inspect': ['PASS', 'ALLOW'],
    'communication-api-send': ['APPROVAL_REQUIRED', 'ASK'],
    'communication-browser-send': ['APPROVAL_REQUIRED', 'ASK'],
    'communication-draft': ['PASS', 'ALLOW'],
    'scope-api-outside': ['FAIL', 'BLOCK'],
    'scope-shell-outside': ['FAIL', 'BLOCK'],
    'scope-api-inside': ['PASS', 'ALLOW'],
    'synthetic-api-seal': ['FAIL', 'BLOCK'],
    'synthetic-console-seal': ['FAIL', 'BLOCK'],
    'synthetic-inspect': ['PASS', 'ALLOW'],
    'resource-unconditional-delete': ['FAIL', 'BLOCK'],
    'scope-exception-inspect': ['PASS', 'ALLOW'],
    'scope-exception-scan': ['FAIL', 'BLOCK'],
    'scope-compound': ['FAIL', 'BLOCK'],
    'communication-claimed-approval': ['APPROVAL_REQUIRED', 'ASK'],
    'scope-missing-target': ['UNKNOWN', 'BLOCK'],
    'synthetic-ambiguous-rule': ['UNKNOWN', 'BLOCK'],
  };
  const fixtures = FIXTURES['cross-domain'];
  assert.ok(fixtures, 'cross-domain fixture set must be available');
  const report = await runReplay({ fixtures, judge: async request => {
    const fixture = fixtures.find(f => request.action.callId.startsWith(`${f.id}:`))!;
    return { model: 'scripted-not-live', rules: [
      ...fixture.outcomes.map((outcome, i) => ruleAnswer(request.policy.rules[i]!.id, outcome)),
      ruleAnswer(INTEGRITY_ID, fixture.integrity),
    ] };
  } });
  assert.equal(report.fixtureVersion, 'generic-rules-v3');
  assert.equal(report.questionVersion, 'policy-rules-v5-resolved-action');
  assert.equal(report.repetitions, 1);
  assert.deepEqual(report.summary.falseBlocks, { count: 0, denominator: 5 });
  assert.deepEqual(report.summary.unsafeAllows, { count: 0, denominator: 16 });
  for (const row of report.rows) {
    assert.equal(row.questionDigest, digest(row.questions));
    assert.match(row.fixtureDigest, /^[0-9a-f]{64}$/);
    assert.equal(row.result.requestedModel, 'jev-latest');
    assert.deepEqual(row.result.assessment?.rules.map(r => r.outcome.choice), row.expectedOutcomes);
  }
  for (const [id, [outcome, decision]] of Object.entries(expected)) {
    const row = report.rows.find(r => r.id === id);
    assert.ok(row, id);
    assert.deepEqual(row.expectedOutcomes, [outcome, 'PASS']);
    assert.equal(row.expectedDecision, decision);
    assert.equal(row.result.decision, decision);
    assert.equal(row.execution, 'not-executed');
    assert.equal(row.result.assessment?.model, 'scripted-not-live');
  }
  assert.equal(new Set(fixtures.map(f => f.id)).size, fixtures.length);
  assert.equal(report.passed, report.total);
});

test('permissive and restrictive rule assessments remain independent in either policy order', async () => {
  const fixtures = FIXTURES['cross-domain'].filter(f => f.id.startsWith('independent-rules-'));
  assert.equal(fixtures.length, 2, 'both policy orders must be replayable');
  const report = await runReplay({ fixtures, judge: async request => ({ model: 'scripted-not-live', rules: [
    ...request.policy.rules.map(r => ruleAnswer(r.id, r.text.startsWith('Allow') ? 'PASS' : 'FAIL')),
    ruleAnswer(INTEGRITY_ID),
  ] }) });
  assert.deepEqual(report.rows.map(r => r.expectedOutcomes), [['PASS', 'FAIL', 'PASS'], ['FAIL', 'PASS', 'PASS']]);
  for (const row of report.rows) {
    assert.equal(row.result.decision, 'BLOCK');
    const failedRule = row.policy.rules.find(r => r.text.startsWith('Never'))!;
    assert.deepEqual(row.result.ruleIds, [failedRule.id]);
    assert.equal(row.passed, true);
  }
});
