import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applicabilityCorpus, applicabilityCorpusDigest, fixtureIdentity } from '../eval/applicability-fixtures.js';
import { compareApplicability, type ComparisonObservation } from '../eval/applicability-comparison.js';
import { scriptedApplicabilityComparison } from '../eval/applicability-replay.js';
import { DEFAULTS } from '../src/decision/decide.js';
import { ASSESSMENT_METADATA } from '../src/decision/assessment-contract.js';
import { answer } from './helpers.js';

test('sanitized canonical and held-out expectations are frozen before evaluation', () => {
  assert.equal(applicabilityCorpusDigest, '2b13a9749fb11ee7c1b3465cc088d33fe5941a45991a3212259d929536537872');
  assert.ok(Object.isFrozen(applicabilityCorpus));
  assert.ok(applicabilityCorpus.fixtures.every(Object.isFrozen));
  assert.equal(new Set(applicabilityCorpus.fixtures.map(f => f.id)).size, applicabilityCorpus.fixtures.length);
  assert.doesNotMatch(JSON.stringify(applicabilityCorpus), /\/Users\/|@|api.key|token=/i);
});

test('scripted comparisons retain independent denominators, profile identities and missing rows', async () => {
  const report = await scriptedApplicabilityComparison();
  assert.equal(report.automaticPromotion, false);
  assert.equal(report.fixtureActionsExecuted, false);
  assert.equal(report.semanticAccuracy, 'unverified');
  assert.equal(report.rows.length, applicabilityCorpus.fixtures.length);
  const candidate = report.summaries.find(r => r.profile === 'applicability-v1' && r.split === 'canonical')!;
  assert.equal(candidate.falseBlocks.denominator, 6);
  assert.equal(candidate.unsafeAllows.denominator, 6);
  assert.equal(candidate.falseBlocks.numerator, 0);
  assert.equal(candidate.unsafeAllows.numerator, 0);
  assert.equal(report.rows.filter(r => r.status === 'unavailable-or-incomplete').length, 1);
  for (const row of report.rows) {
    assert.ok(row.policyDigest && row.fixtureDigest && row.questionVersion && row.thresholds);
    if (row.status === 'scripted') assert.equal(row.returnedModel, 'offline-scripted-not-a-model');
  }
  const missing = compareApplicability([]);
  assert.ok(missing.rows.every(r => r.status === 'skipped'));
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
  assert.deepEqual(summary.falseBlocks, { numerator: 6, denominator: 6, rate: 1 });
  const benign = observations.filter(row => applicabilityCorpus.fixtures.find(f => f.id === row.fixtureId)!.expectedDecision === 'ALLOW');
  benign[0]!.result!.decision = 'ASK';
  benign[1]!.result = null;
  const mixed = compareApplicability(benign).summaries.find(r => r.profile === 'applicability-v1' && r.split === 'canonical')!;
  assert.deepEqual(mixed.falseBlocks, { numerator: 4, denominator: 5, rate: 0.8 });
  assert.deepEqual(mixed.unnecessaryApprovals, { numerator: 1, denominator: 5, rate: 0.2 });
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
