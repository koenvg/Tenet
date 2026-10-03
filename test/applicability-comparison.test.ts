import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applicabilityCorpus, applicabilityCorpusDigest, historicalApplicabilityCorpus, historicalApplicabilityCorpusDigest, fixtureIdentity } from '../eval/applicability-fixtures.js';
import { compareApplicability, type ComparisonObservation } from '../eval/applicability-comparison.js';
import { scriptedApplicabilityComparison, runApplicabilityComparison } from '../eval/applicability-replay.js';
import { DEFAULTS } from '../src/decision/decide.js';
import { ASSESSMENT_METADATA } from '../src/decision/assessment-contract.js';
import { answer } from './helpers.js';

test('sanitized canonical and held-out expectations are frozen before evaluation', () => {
  assert.equal(applicabilityCorpusDigest, 'da49418db06023f3f2636f78e1c12341d2237708946347ed37fb9c64d79e9f51');
  assert.ok(Object.isFrozen(applicabilityCorpus));
  assert.ok(applicabilityCorpus.fixtures.every(Object.isFrozen));
  assert.equal(new Set(applicabilityCorpus.fixtures.map(f => f.id)).size, applicabilityCorpus.fixtures.length);
  assert.doesNotMatch(JSON.stringify(applicabilityCorpus), /\/Users\/|@|api.key|token=/i);
  assert.equal(historicalApplicabilityCorpusDigest, '2b13a9749fb11ee7c1b3465cc088d33fe5941a45991a3212259d929536537872');
  assert.equal(applicabilityCorpus.fixtures.length, 29);
  assert.equal(fixtureIdentity(applicabilityCorpus.fixtures[0]!).fixtureDigest, 'e17964676702e815ce5981c9838f89e746a8cfe63c32c2caf9f6dd3c34ed3efc');
  for (const old of historicalApplicabilityCorpus.fixtures) assert.deepEqual(fixtureIdentity(old), fixtureIdentity(applicabilityCorpus.fixtures.find(f => f.id === old.id)!));
  assert.equal(applicabilityCorpus.fixtures.find(f => f.id === 'unsupported-read')!.expectedOutcome, 'PASS');
  assert.equal(applicabilityCorpus.fixtures.find(f => f.id === 'read-source')!.expectedOutcome, 'NOT_APPLICABLE');
});

test('scripted comparisons retain independent denominators, profile identities and missing rows', async () => {
  const report = await scriptedApplicabilityComparison();
  assert.equal(report.automaticPromotion, false);
  assert.equal(report.fixtureActionsExecuted, false);
  assert.equal(report.semanticAccuracy, 'unverified');
  assert.equal(report.rows.length, applicabilityCorpus.fixtures.length * 2);
  const candidate = report.summaries.find(r => r.questionVersion === ASSESSMENT_METADATA.questionVersion && r.split === 'canonical')!;
  assert.equal(candidate.falseBlocks.denominator, 11);
  assert.equal(candidate.unsafeAllows.denominator, 6);
  assert.equal(candidate.falseBlocks.numerator, 0);
  assert.equal(candidate.unsafeAllows.numerator, 0);
  assert.equal(report.rows.filter(r => r.status === 'unavailable').length, 1);
  for (const row of report.rows) {
    assert.ok(row.policyDigest && row.fixtureDigest && row.questionVersion);
    if (row.status === 'scripted') {
      assert.ok(row.thresholds && row.questionDigest && row.payloadDigest && row.evidenceContext);
      assert.equal(row.returnedModel, 'offline-scripted-not-a-model');
    }
  }
  const missing = compareApplicability([]);
  assert.ok(missing.rows.every(r => r.status === 'missing-result'));
  assert.ok(missing.summaries.every(r => r.evaluated === 0));
});

test('an unsafe allow remains visible even if benign cases improve or evidence was omitted', () => {
  const fixture = applicabilityCorpus.fixtures.find(f => f.id === 'actual-commit')!;
  const row: ComparisonObservation = { ...fixtureIdentity(fixture), ...ASSESSMENT_METADATA,
    evidenceCoverage: 'partial', omissions: ['missing-effect'], result: { ...ASSESSMENT_METADATA,
      config: DEFAULTS, decision: 'ALLOW', reason: 'all-rules-pass', assessment: answer(), diagnostics: [], ruleIds: [], durationMs: 0, requestedModel: 'offline' } };
  const report = compareApplicability([row]);
  assert.equal(report.summaries.find(r => r.profile === row.profile && r.split === 'canonical')!.unsafeAllows.numerator, 1);
  assert.equal(report.automaticPromotion, false);
  assert.throws(() => compareApplicability([row, row]), /identity-mismatch/);
  assert.throws(() => compareApplicability([{ ...row, fixtureDigest: 'changed' }]), /identity-mismatch/);
  assert.throws(() => compareApplicability([{ ...row, questionVersion: 'legacy' }]), /identity-mismatch/);
});

test('unavailable and incomplete decisions cannot improve operational friction rates', () => {
  const observations: ComparisonObservation[] = applicabilityCorpus.fixtures.map(fixture => ({
    ...fixtureIdentity(fixture), ...ASSESSMENT_METADATA,
    evidenceCoverage: 'unavailable', omissions: ['provider-unavailable'], result: {
      ...ASSESSMENT_METADATA, config: DEFAULTS,
      decision: 'BLOCK', reason: 'invalid-response', assessment: null, diagnostics: [], ruleIds: [], durationMs: 0, requestedModel: 'offline' },
  }));
  const summary = compareApplicability(observations).summaries.find(r => r.profile === 'applicability-v1' && r.split === 'canonical')!;
  assert.equal(summary.evaluated, 0);
  assert.deepEqual(summary.falseBlocks, { numerator: 11, denominator: 11, rate: 1 });
  const benign = observations.filter(row => applicabilityCorpus.fixtures.find(f => f.id === row.fixtureId)!.expectedDecision === 'ALLOW');
  benign[0]!.result!.decision = 'ASK';
  benign[1]!.result = null;
  const mixed = compareApplicability(benign).summaries.find(r => r.profile === 'applicability-v1' && r.split === 'canonical')!;
  assert.deepEqual(mixed.falseBlocks, { numerator: 9, denominator: 10, rate: 0.9 });
  assert.deepEqual(mixed.unnecessaryApprovals, { numerator: 1, denominator: 10, rate: 0.1 });
  const empty = compareApplicability([]).summaries[0]!;
  assert.equal(empty.falseBlocks.rate, null);
  assert.equal(empty.unnecessaryApprovals.rate, null);
});

test('recorded older contracts can be compared without running or reinterpreting their evaluator', () => {
  const fixture = applicabilityCorpus.fixtures[0]!;
  const legacy = { profile: 'legacy', questionVersion: 'policy-rules-v5-resolved-action' };
  const result = { questionVersion: legacy.questionVersion, config: DEFAULTS, decision: 'BLOCK' as const, reason: 'insufficient-evidence' as const,
    assessment: { model: 'archived', rules: [{ ruleId: 'archived-rule',
      outcome: { choice: 'PASS' as const, probabilities: { PASS: 0.91, FAIL: 0.03, UNKNOWN: 0.03, APPROVAL_REQUIRED: 0.03 } },
      evidence: { choice: 'SUFFICIENT' as const, probabilities: { SUFFICIENT: 0.8, INSUFFICIENT: 0.2 } } }] },
    diagnostics: [], ruleIds: [], durationMs: 0, requestedModel: 'archived' };
  const rows = [{ ...fixtureIdentity(fixture), ...legacy, evidenceCoverage: 'unrecorded', omissions: [], result }];
  const before = JSON.stringify(rows);
  const report = compareApplicability(rows, [legacy, ASSESSMENT_METADATA]);
  const old = report.rows.find(row => row.profile === legacy.profile && row.fixtureId === fixture.id)!;
  assert.equal(old.questionVersion, legacy.questionVersion);
  assert.equal(old.contributions, null);
  assert.equal(old.semanticComparable, false);
  assert.equal(report.summaries.find(row => row.profile === legacy.profile)!.semanticMisclassifications.rate, null);
  assert.equal(JSON.stringify(rows), before);
  assert.throws(() => compareApplicability([{ ...rows[0]!, result: { ...result, profile: 'conflicting' } }], [legacy]), /comparison-identity-mismatch/);
  assert.throws(() => compareApplicability([{ ...rows[0]!, ...ASSESSMENT_METADATA,
    result: { ...result, questionVersion: ASSESSMENT_METADATA.questionVersion } }]), /comparison-identity-mismatch/);
});


test('same-profile question versions keep independent rows and summaries', async () => {
  const current = await scriptedApplicabilityComparison();
  const fixture = applicabilityCorpus.fixtures[0]!;
  const historical = { profile: 'applicability-v1', questionVersion: 'policy-rules-v6-applicability' };
  const result = { ...current.rows[0]!, ...historical };
  const observation: ComparisonObservation = { ...fixtureIdentity(fixture), ...historical,
    evidenceCoverage: 'complete', omissions: [], result: {
      ...historical, decision: 'BLOCK', reason: 'insufficient-evidence', config: DEFAULTS,
      assessment: result.assessment, diagnostics: [], ruleIds: [], durationMs: 0, requestedModel: 'archived-script' } };
  const report = compareApplicability([observation], [historical, ASSESSMENT_METADATA]);
  assert.equal(report.rows.length, applicabilityCorpus.fixtures.length * 2);
  assert.equal(report.rows.find(r => r.questionVersion === historical.questionVersion)!.decision, 'BLOCK');
  assert.equal(report.rows.find(r => r.questionVersion === ASSESSMENT_METADATA.questionVersion)!.decision, null);
  assert.equal(report.summaries.length, 4);
  assert.ok(report.summaries.every(r => 'questionVersion' in r));
  assert.throws(() => compareApplicability([], [historical, historical]), /duplicate-comparison-contract/);
  assert.throws(() => compareApplicability([observation, observation], [historical]), /identity-mismatch/);
});


test('historical expectations are absent and incomplete allows never earn correctness or reduction credit', async () => {
  const supplied = await scriptedApplicabilityComparison();
  const fixture = applicabilityCorpus.fixtures.find(f => f.id === 'unsupported-read')!;
  const historical = { profile: 'applicability-v1', questionVersion: 'policy-rules-v6-applicability' };
  const current = { ...ASSESSMENT_METADATA, questionDigest: 'current-question-digest' };
  const result = supplied.rows.find(r => r.fixtureId === fixture.id && r.questionVersion === current.questionVersion)!.assessment;
  const decision = { ...ASSESSMENT_METADATA, config: DEFAULTS, decision: 'ALLOW' as const, reason: 'all-rules-pass' as const,
    assessment: result, diagnostics: [], ruleIds: [], durationMs: 0, requestedModel: 'offline' };
  const rows: ComparisonObservation[] = [
    { ...fixtureIdentity(fixture), ...historical, evidenceCoverage: 'unsupported', omissions: [],
      result: { ...decision, ...historical, decision: 'BLOCK' } },
    { ...fixtureIdentity(fixture), ...current, evidenceCoverage: 'unsupported', omissions: ['missing-rule-result'], evaluationStatus: 'incomplete', result: decision },
  ];
  const report = compareApplicability(rows, [historical, current]);
  const old = report.rows.find(r => r.fixtureId === fixture.id && r.questionVersion === historical.questionVersion)!;
  assert.equal(old.expectedOutcome, null);
  assert.equal(old.semanticMisclassification, false);
  const summary = report.summaries.find(r => r.questionVersion === current.questionVersion && r.split === 'canonical')!;
  assert.equal(summary.correctClassifications.numerator, 0);
  assert.equal(summary.incompleteAssessments.numerator, 1);
  assert.equal(summary.missingResults.numerator, 16);
  assert.equal(report.comparisons[0]!.reducedFalseBlocks.numerator, 0);
  assert.throws(() => compareApplicability([{ ...rows[1]!, questionDigest: 'wrong' }], [current]), /identity-mismatch/);
  assert.throws(() => compareApplicability([{ ...rows[1]!, policyDigest: 'wrong' }], [current]), /identity-mismatch/);
});


test('protected unsafe allows and opposing changes remain separate from benign reduction', async () => {
  const supplied = await scriptedApplicabilityComparison();
  const historical = { profile: 'applicability-v1', questionVersion: 'policy-rules-v6-applicability' };
  const make = (id: string, contract: typeof historical, decision: 'ALLOW' | 'BLOCK' | 'ASK'): ComparisonObservation => {
    const fixture = applicabilityCorpus.fixtures.find(f => f.id === id)!;
    const recorded = supplied.rows.find(r => r.fixtureId === id && r.questionVersion === ASSESSMENT_METADATA.questionVersion)!;
    return { ...fixtureIdentity(fixture), ...contract, evidenceCoverage: recorded.evidenceCoverage, omissions: [], result: {
      ...contract, config: DEFAULTS, decision, reason: 'all-rules-pass', assessment: recorded.assessment,
      diagnostics: recorded.diagnostics!, ruleIds: [], durationMs: 0, requestedModel: 'separately-supplied-script' } };
  };
  const observations = [make('unsupported-read', historical, 'BLOCK'), make('unsupported-read', ASSESSMENT_METADATA, 'ALLOW'),
    make('unsupported-inert-edit', historical, 'ALLOW'), make('unsupported-inert-edit', ASSESSMENT_METADATA, 'BLOCK'),
    make('actual-commit', historical, 'BLOCK'), make('actual-commit', ASSESSMENT_METADATA, 'ALLOW')];
  const snapshot = JSON.stringify(observations);
  const report = compareApplicability(observations, [historical, ASSESSMENT_METADATA]);
  assert.deepEqual(report.comparisons[0]!.reducedFalseBlocks, { numerator: 1, denominator: 1, rate: 1 });
  assert.deepEqual(report.comparisons[0]!.increasedFalseBlocks, { numerator: 1, denominator: 2, rate: 0.5 });
  assert.deepEqual(report.comparisons[0]!.unsafeAllowsAfter, { numerator: 1, denominator: 1, rate: 1 });
  assert.equal(report.unsafeAllowPresent, true);
  assert.equal(report.rows.find(r => r.fixtureId === 'actual-commit' && r.questionVersion === ASSESSMENT_METADATA.questionVersion)!.selectedViolation, true);
  assert.equal(JSON.stringify(observations), snapshot);
  assert.equal(report.semanticAccuracy, 'unverified');
});

test('offline replay captures revised current evidence and never requests a provider', async () => {
  const priorFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (() => { requests++; throw new Error('provider forbidden'); }) as typeof fetch;
  try {
    const json = await runApplicabilityComparison([]);
    assert.equal(await runApplicabilityComparison([]), json);
    const report = JSON.parse(json);
    const current = report.rows.filter((r: any) => r.questionVersion === ASSESSMENT_METADATA.questionVersion);
    const pressure = current.find((r: any) => r.fixtureId === 'metadata-history-pressure');
    assert.equal(pressure.submittedState.action.description, 'Read one file and return literal content.');
    assert.deepEqual(pressure.submittedState.action.parameters, { type: 'object' });
    assert.ok(pressure.submittedState.trajectory.omitted > 0);
    assert.ok(pressure.omissions.some((s: string) => s.startsWith('history-omitted:')));
    const fallback = current.find((r: any) => r.fixtureId === 'schema-fallback');
    assert.equal(fallback.submittedState.action.description, 'Read one file and return literal content.');
    assert.equal(fallback.submittedState.action.parameters, null);
    assert.ok(fallback.omissions.includes('tool-metadata-omitted'));
    assert.equal(fallback.evidenceCoverage, 'unsupported');
    assert.equal(fallback.status, 'scripted');
    assert.deepEqual(fallback.thresholds, DEFAULTS);
    assert.equal(report.comparisons[0].pairedComplete.numerator, 0);
    assert.equal(report.comparisons[0].reducedFalseBlocks.rate, null);
    assert.equal(report.providerRequestsSent, false);
    const readable = await runApplicabilityComparison(['--format=markdown']);
    assert.match(readable, /Semantic accuracy is unverified/);
    assert.match(readable, /Protected unsafe ALLOW present/);
    assert.match(readable, /missing-result/);
    assert.match(readable, /policy-rules-v7-ordinary-evidence/);
    await assert.rejects(() => runApplicabilityComparison(['--live']), /Offline only/);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = priorFetch; }
});
