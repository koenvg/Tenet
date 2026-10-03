import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { applicabilityCorpus, fixtureIdentity } from '../eval/applicability-fixtures.js';
import { compareApplicability, type ComparisonObservation } from '../eval/applicability-comparison.js';
import { runApplicabilityComparison, scriptedApplicabilityComparison } from '../eval/applicability-replay.js';
import { ASSESSMENT_METADATA } from '../src/decision/assessment-contract.js';
import { DEFAULTS } from '../src/decision/decide.js';

test('offline supplied observations retain their identity and missing evaluation', async () => {
  const dir = mkdtempSync('/tmp/tenet34-');
  try {
    const fixture = applicabilityCorpus.fixtures[0]!;
    const contract = { profile: 'applicability-v1', questionVersion: 'policy-rules-v6-applicability' };
    const observations = [{ ...fixtureIdentity(fixture), ...contract, evidenceCoverage: 'unrecorded', omissions: ['not-evaluated'], result: null }];
    const path = join(dir, 'before.json');
    writeFileSync(path, JSON.stringify({ contract, observations }));
    const output = JSON.parse(await runApplicabilityComparison([`--before=${path}`]));
    assert.equal(output.rows.length, 58);
    const historical = output.rows.find((r: any) => r.fixtureId === fixture.id && r.questionVersion === contract.questionVersion);
    assert.equal(historical.expectedOutcome, null);
    assert.equal(historical.decision, null);
    assert.deepEqual(historical.omissions, ['not-evaluated']);
    assert.equal(historical.status, 'missing-result');
    assert.equal(output.comparisons[0].reducedFalseBlocks.rate, null);
    writeFileSync(path, JSON.stringify({ contract, observations: [...observations, ...observations] }));
    await assert.rejects(() => runApplicabilityComparison([`--before=${path}`]), /identity-mismatch/);
    writeFileSync(path, 'null');
    await assert.rejects(() => runApplicabilityComparison([`--before=${path}`]), /invalid-supplied-comparison/);
    await assert.rejects(() => runApplicabilityComparison(['--format=html']), /Offline only/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('missing integrity and malformed report status cannot become complete classification', async () => {
  const supplied = await scriptedApplicabilityComparison();
  const fixture = applicabilityCorpus.fixtures.find(f => f.id === 'unsupported-read')!;
  const current = supplied.rows.find(r => r.fixtureId === fixture.id && r.questionVersion === ASSESSMENT_METADATA.questionVersion)!;
  const observation: ComparisonObservation = { ...fixtureIdentity(fixture), ...ASSESSMENT_METADATA,
    evaluationStatus: 'complete', evidenceCoverage: 'unsupported', omissions: [], result: {
      ...ASSESSMENT_METADATA, config: DEFAULTS, decision: 'ALLOW', reason: 'all-rules-pass', diagnostics: [],
      ruleIds: [], durationMs: 0, requestedModel: 'script', assessment: { ...current.assessment!, rules: [current.assessment!.rules[0]!] } } };
  const report = compareApplicability([observation]);
  assert.equal(report.rows.find(r => r.fixtureId === fixture.id)!.status, 'incomplete');
  assert.equal(report.summaries[0]!.correctClassifications.numerator, 0);
  assert.equal(report.summaries[0]!.correctClassifications.rate, null);
  assert.throws(() => compareApplicability([observation], []), /invalid-comparison-contract/);
  assert.throws(() => compareApplicability([{ ...observation, evaluationStatus: 'skipped' as any }]), /invalid-comparison-observation/);
  assert.throws(() => compareApplicability([{ ...observation, result: { ...observation.result!, questionVersion: 'wrong' } }]), /identity-mismatch/);
});


test('wrong user-rule identity on either side earns no classification or reduction credit', async () => {
  const supplied = await scriptedApplicabilityComparison();
  const historical = { profile: 'applicability-v1', questionVersion: 'policy-rules-v6-applicability' };
  const make = (id: string, contract: typeof historical, decision: 'ALLOW' | 'BLOCK'): ComparisonObservation => {
    const fixture = applicabilityCorpus.fixtures.find(f => f.id === id)!;
    const row = supplied.rows.find(r => r.fixtureId === id && r.questionVersion === ASSESSMENT_METADATA.questionVersion)!;
    return { ...fixtureIdentity(fixture), ...contract, evidenceCoverage: row.evidenceCoverage, omissions: [],
      evaluationStatus: 'complete', result: { ...contract, config: DEFAULTS, decision, reason: 'all-rules-pass',
        assessment: structuredClone(row.assessment), diagnostics: row.diagnostics!, ruleIds: [], durationMs: 0, requestedModel: 'script' } };
  };
  for (const side of [0, 1]) {
    const observations = [make('unsupported-read', historical, 'BLOCK'), make('unsupported-read', ASSESSMENT_METADATA, 'ALLOW')];
    observations[side]!.result!.assessment!.rules[0]!.ruleId = 'wrong-policy-rule';
    const report = compareApplicability(observations, [historical, ASSESSMENT_METADATA]);
    const corrupt = report.rows.find(r => r.fixtureId === 'unsupported-read' && r.questionVersion === observations[side]!.questionVersion)!;
    assert.equal(corrupt.status, 'incomplete', `side ${side}`);
    assert.equal(corrupt.correctClassification, false);
    assert.equal(report.summaries.find(s => s.questionVersion === observations[side]!.questionVersion && s.split === 'canonical')!.incompleteAssessments.numerator, 1);
    assert.equal(report.comparisons[0]!.pairedComplete.numerator, 0);
    assert.deepEqual(report.comparisons[0]!.reducedFalseBlocks, { numerator: 0, denominator: 0, rate: null });
  }
  const protectedAllow = make('actual-commit', ASSESSMENT_METADATA, 'ALLOW');
  protectedAllow.result!.assessment!.rules[0]!.ruleId = 'wrong-policy-rule';
  const report = compareApplicability([protectedAllow]);
  const protectedRow = report.rows.find(r => r.fixtureId === 'actual-commit')!;
  assert.equal(protectedRow.status, 'incomplete');
  assert.equal(protectedRow.unsafeAllow, true);
  assert.equal(report.unsafeAllowPresent, true);
  assert.deepEqual(report.summaries[0]!.unsafeAllows, { numerator: 1, denominator: 1, rate: 1 });
  assert.equal(report.summaries[0]!.correctClassifications.numerator, 0);
});
