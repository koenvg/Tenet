import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invocationView } from '../src/inspector/view.js';
import { explainDecision, orderedRules, gateExplanation, primaryStatus, modeLabel, pretty, findingPresentation } from '../inspector/src/standalone-presentation.js';

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

test('schema-3 assessment lifecycle never infers a decision from released permission or execution', () => {
  const base = { schemaVersion: 3, host: 'pi', contextId: 'main', sessionId: 's', invocationId: 'i', callId: 'c',
    toolName: 'edit', cwd: '/work', mode: 'observe', timestamp: 1, writerId: '00000000-0000-0000-0000-000000000000',
    eventId: '00000000-0000-0000-0000-000000000000', sequence: 1 };
  const row = (stage: string, data: object, timestamp: number) => ({ ...base, stage, data, timestamp });
  const pending = invocationView([row('begin', { policy: { rules: [] } }, 1),
    row('permission', { outcome: 'released' }, 2), row('execution', { outcome: 'executed' }, 3),
    row('assessment-status', { status: 'pending', profile: 'legacy' }, 4)] as any);
  assert.equal(pending.permission, 'released');
  assert.equal(pending.execution, 'executed');
  assert.equal(pending.decision, 'unavailable');
  assert.equal(pending.assessmentStatus, 'pending');
  const dropped = invocationView([row('assessment-status', { status: 'dropped', reason: 'queue-capacity' }, 5),
    row('permission', { outcome: 'released' }, 2), row('begin', { policy: { rules: [] } }, 1)] as any);
  assert.equal(dropped.assessmentStatus, 'dropped');
  assert.equal(dropped.decision, 'unavailable');
  assert.equal(dropped.execution, 'unknown');
  const completed = invocationView([row('decision', { decision: 'BLOCK', reason: 'rule-failed' }, 6),
    row('assessment-status', { status: 'completed', queueWaitMs: 42, providerDurationMs: 120 }, 7),
    row('execution', { outcome: 'executed' }, 3), row('permission', { outcome: 'released' }, 2)] as any);
  assert.equal(completed.assessmentStatus, 'completed');
  assert.equal(completed.decision, 'BLOCK');
  assert.equal(completed.permission, 'released');
  assert.equal(completed.execution, 'executed');
  assert.equal(completed.queueWaitMs, 42);
  assert.equal(completed.providerDurationMs, 120);
});

const complete = (outcome: 'UNKNOWN' | 'FAIL' = 'UNKNOWN') => [
  { stage: 'begin', data: { profile: 'applicability-v1', policy: { rules: [{ id: 'r', text: 'Authored restriction', line: 1, enforcement: 'BLOCK' }] }, integrity: { id: 'integrity' } } },
  { stage: 'validation', data: { valid: true } },
  { stage: 'assessment', data: { assessment: { model: 'offline', rules: [
    { ruleId: 'r', outcome: { choice: outcome, probabilities: { PASS: 0, FAIL: outcome === 'FAIL' ? 1 : 0, UNKNOWN: outcome === 'UNKNOWN' ? 1 : 0, APPROVAL_REQUIRED: 0, NOT_APPLICABLE: 0 } }, evidence: { choice: 'INSUFFICIENT', probabilities: { SUFFICIENT: 0, INSUFFICIENT: 1 } } },
    { ruleId: 'integrity', outcome: { choice: 'PASS', probabilities: { PASS: 1, FAIL: 0, UNKNOWN: 0, APPROVAL_REQUIRED: 0 } }, evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } },
  ] } } },
  { stage: 'decision', data: { decision: 'BLOCK', reason: 'insufficient-evidence', contributions: [{ ruleId: 'r', gates: ['outcome-unknown'], contribution: 'blocking-gates' }] } },
];
test('no-violation wording requires complete valid recorded rules including integrity, never infers safety', () => {
  const rows = complete();
  const view = invocationView(rows as any);
  assert.equal(view.noRulesClassifiedViolated, true);
  assert.match(explainDecision(view), /No rule was classified as violated/);
  assert.match(explainDecision(view), /blocked by uncertainty/);
  for (const missing of ['begin', 'validation', 'assessment', 'decision']) {
    const incomplete = invocationView(rows.filter(r => r.stage !== missing) as any);
    assert.equal(incomplete.noRulesClassifiedViolated, false, missing);
    assert.ok(!explainDecision(incomplete).includes('No rule was classified'));
  }
  const missingAssessment = complete();
  (missingAssessment[1]!.data as any).assessment = (missingAssessment[2]!.data as any).assessment;
  assert.equal(invocationView(missingAssessment.filter(r => r.stage !== 'assessment') as any).noRulesClassifiedViolated, false);
  assert.equal(invocationView(complete('FAIL') as any).noRulesClassifiedViolated, false);
  const invalid = complete(); (invalid[2]!.data as any).assessment.rules[0].outcome.probabilities.UNKNOWN = .7;
  assert.equal(invocationView(invalid as any).noRulesClassifiedViolated, false);
  const observe = invocationView(rows.map(r => ({ ...r, mode: 'observe' })) as any);
  assert.match(explainDecision(observe), /would block/);
  assert.equal(observe.permission, 'unknown'); assert.equal(observe.execution, 'unknown');
});

for (const stage of ['validation', 'assessment', 'decision', 'assessment-status']) test(`recorded ${stage} validation failure suppresses the affirmative explanation`, () => {
  const rows = complete();
  const row = rows.find(r => r.stage === stage);
  if (row) (row.data as any).valid = false;
  else rows.push({ stage, data: { status: 'completed', valid: false } } as any);
  assert.equal(invocationView(rows as any).noRulesClassifiedViolated, false);
});

for (const defect of ['forbidden references', 'incompatible profile', 'invalid applicability digest', 'invalid applicability operation', 'oversized applicability references'] as const) {
  test(`invalid recorded ${defect} suppresses the affirmative explanation`, () => {
    const rows = complete();
    const assessment = (rows[2]!.data as any).assessment;
    const rule = assessment.rules[0];
    if (defect === 'forbidden references') rule.factReferences = { digest: 'forbidden', operationIds: [42] };
    else if (defect === 'incompatible profile') assessment.profile = 'future-contract';
    else {
      rule.outcome = { choice: 'NOT_APPLICABLE', probabilities: { PASS: 0, FAIL: 0, UNKNOWN: 0, APPROVAL_REQUIRED: 0, NOT_APPLICABLE: 1 } };
      rule.evidence = null;
      rule.factReferences = { digest: 'recorded-digest', operationIds: ['recorded-operation'] };
      if (defect === 'invalid applicability digest') rule.factReferences.digest = 'x'.repeat(129);
      if (defect === 'invalid applicability operation') rule.factReferences.operationIds = [''];
      if (defect === 'oversized applicability references') rule.factReferences.operationIds = Array(65).fill('recorded-operation');
    }
    const view = invocationView(rows as any);
    assert.equal(view.noRulesClassifiedViolated, false);
    assert.ok(!explainDecision(view).includes('No rule was classified'));
  });
}
for (const stage of ['validation', 'assessment', 'decision', 'assessment-status']) {
  test(`recorded ${stage} validation issues suppress the affirmative explanation`, () => {
    const rows = complete();
    const row = rows.find(r => r.stage === stage);
    if (row) (row.data as any).validationIssue = 'response-shape';
    else rows.push({ stage, data: { status: 'completed', validationIssue: 'response-shape' } } as any);
    const view = invocationView(rows as any);
    assert.equal(view.validationIssue, 'response-shape');
    assert.equal(view.noRulesClassifiedViolated, false);
    assert.ok(!explainDecision(view).includes('No rule was classified'));
  });
}
test('complete unprofiled legacy assessments use their historical contract, not the display label', () => {
  const rows = complete();
  delete (rows[0]!.data as any).profile;
  delete (rows[2]!.data as any).assessment.rules[0].outcome.probabilities.NOT_APPLICABLE;
  const view = invocationView(rows as any);
  assert.equal(view.assessmentProfile, 'legacy (historical)');
  assert.equal(view.noRulesClassifiedViolated, true);
  assert.match(explainDecision(view), /No rule was classified as violated/);
});


for (const execution of ['executed', 'failed', 'unknown', undefined, 'future-result']) {
  for (const permission of ['blocked', 'released', 'unknown', undefined, 'future-permission']) {
    test(`execution-first status for ${execution} / ${permission}`, () => {
      const facts = Object.freeze({ execution, permission });
      const status = primaryStatus(facts);
      const expected = execution === 'executed' ? ['Ran', 'neutral'] : execution === 'failed' ? ['Failed', 'danger']
        : permission === 'blocked' ? ['TENET blocked', 'danger'] : permission === 'released' ? ['Not blocked by Tenet', 'caution'] : ['Execution unknown', 'neutral'];
      assert.deepEqual([status.label, status.tone], expected);
      assert.equal(status.inconsistency, permission === 'blocked' && ['executed', 'failed'].includes(execution ?? ''));
      assert.equal(!!status.notice, status.inconsistency);
      if (status.notice) assert.match(status.notice, new RegExp(`permission is blocked, but execution is ${execution}`));
    });
  }
}
test('assessment, approval, mode and scores cannot change primary status', () => {
  for (const decision of ['BLOCK', 'ASK', 'ALLOW', 'unavailable']) {
    for (const mode of ['observe', 'enforce', undefined]) {
      const facts = { decision, mode, approval: 'approved', scores: { PASS: 1 } };
      assert.equal(primaryStatus(facts as any).label, 'Execution unknown');
      assert.equal(primaryStatus({ ...facts, permission: 'released' }).label, 'Not blocked by Tenet');
      assert.equal(primaryStatus({ ...facts, execution: 'failed' }).label, 'Failed');
    }
  }
  assert.match(primaryStatus({ permission: 'released' }).explanation, /Execution unknown.*does not prove dispatch/);
  assert.match(primaryStatus({ execution: 'failed' }).explanation, /does not prove.*external effects/);
  assert.equal(modeLabel(undefined), 'Mode unknown');
});
test('recorded gates and scores remain exact; uncertainty and FAIL stay distinct summary findings', () => {
  const rule = fixture().rules[1]!;
  rule.result!.outcome.probabilities.PASS = 1;
  rule.gateIds = ['outcome-unknown', 'outcome-confidence-below-threshold', 'evidence-insufficient', 'evidence-confidence-below-threshold', 'applicability-unresolved', 'rule-fail'];
  const captured = JSON.parse(pretty(rule));
  assert.deepEqual(captured.gateIds, rule.gateIds);
  assert.equal(captured.result.outcome.probabilities.PASS, 1);
  assert.deepEqual(captured, rule);
  assert.equal(findingPresentation('violation').tone, 'danger');
  assert.equal(findingPresentation('uncertainty').tone, 'caution');
});
