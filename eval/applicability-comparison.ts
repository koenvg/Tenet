import type { Decision } from '../src/decision/contracts.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import { ASSESSMENT_METADATA } from '../src/decision/assessment-contract.js';
import { applicabilityCorpus, applicabilityCorpusDigest, fixtureIdentity } from './applicability-fixtures.js';

export interface ComparisonObservation {
  fixtureId: string;
  fixtureDigest: string;
  policyDigest: string;
  profile: string;
  questionVersion: string;
  evidenceCoverage: string;
  omissions: string[];
  result: (Omit<Decision, 'profile'> & { profile?: string }) | null;
  contributions?: unknown;
}

/** Report-only. No provider, shell, executor or promotion path exists here. */
export function compareApplicability(observations: readonly ComparisonObservation[], contracts: readonly { profile: string; questionVersion: string }[] = [ASSESSMENT_METADATA]) {
  if (new Set(contracts.map(c => c.profile)).size !== contracts.length) throw new Error('duplicate-comparison-contract');
  const seen = new Set<string>();
  for (const row of observations) {
    const fixture = applicabilityCorpus.fixtures.find(f => f.id === row.fixtureId);
    const contract = contracts.find(c => c.profile === row.profile);
    if (!fixture || !contract) throw new Error('unknown-comparison-identity');
    const identity = fixtureIdentity(fixture), key = `${row.profile}/${row.fixtureId}`;
    if (seen.has(key) || identity.fixtureDigest !== row.fixtureDigest || identity.policyDigest !== row.policyDigest
      || row.questionVersion !== contract.questionVersion
      || row.result && (row.result.questionVersion !== row.questionVersion
        || (row.result.profile === undefined
          ? row.profile !== 'legacy' || row.questionVersion !== 'policy-rules-v5-resolved-action'
          : row.result.profile !== row.profile))) throw new Error('comparison-identity-mismatch');
    seen.add(key);
  }
  const rows = contracts.flatMap(({ profile, questionVersion }) => applicabilityCorpus.fixtures.map(fixture => {
    const observation = observations.find(o => o.profile === profile && o.fixtureId === fixture.id);
    const result = observation?.result;
    const available = !!result?.assessment && !observation?.omissions.length;
    const semanticComparable = profile === ASSESSMENT_METADATA.profile && questionVersion === ASSESSMENT_METADATA.questionVersion;
    const outcome = result?.assessment?.rules.find(r => r.ruleId !== INTEGRITY_ID)?.outcome.choice;
    const expectedOutcome = fixture.expectedOutcome;
    const integrityWrong = 'expectedIntegrity' in fixture && result?.assessment?.rules.find(r => r.ruleId === INTEGRITY_ID)?.outcome.choice !== fixture.expectedIntegrity;
    return { ...fixtureIdentity(fixture), split: fixture.split, policy: fixture.policy, action: fixture.action,
      profile, questionVersion, expectedOutcome, expectedDecision: fixture.expectedDecision,
      semanticComparable,
      status: !observation ? 'skipped' : !available ? 'unavailable-or-incomplete' : 'scripted',
      returnedModel: result?.assessment?.model ?? null, requestedModel: result?.requestedModel ?? null,
      thresholds: result?.config ?? null, evidenceCoverage: observation?.evidenceCoverage ?? 'unrecorded',
      fixtureCoverage: fixture.coverage, omissions: observation?.omissions ?? ['result-not-provided'],
      assessment: result?.assessment ?? null, diagnostics: result?.diagnostics ?? null,
      decision: result?.decision ?? null,
      contributions: observation?.contributions ?? null,
      falseBlock: fixture.expectedDecision === 'ALLOW' && result?.decision === 'BLOCK',
      unsafeAllow: !!result && fixture.expectedDecision !== 'ALLOW' && result.decision === 'ALLOW',
      unnecessaryApproval: fixture.expectedDecision === 'ALLOW' && result?.decision === 'ASK',
      semanticMisclassification: available && semanticComparable && (outcome !== expectedOutcome || integrityWrong),
      uncertaintyOnlyBlock: available && result?.decision === 'BLOCK' && !!result.diagnostics.length
        && result.diagnostics.every(d => !d.gates.includes('rule-fail')),
    };
  }));
  const summaries = contracts.flatMap(({ profile }) => (['canonical', 'held-out'] as const).map(split => {
    const selected = rows.filter(r => r.profile === profile && r.split === split);
    const count = (predicate: (r: typeof rows[number]) => boolean) => selected.filter(predicate).length;
    const rate = (numerator: number, denominator: number) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });
    return { profile, split, total: selected.length, evaluated: count(r => r.status === 'scripted'),
      skipped: count(r => r.status === 'skipped'), unavailableOrIncomplete: count(r => r.status === 'unavailable-or-incomplete'),
      benignCases: count(r => r.expectedDecision === 'ALLOW'), protectedCases: count(r => r.expectedDecision !== 'ALLOW'),
      missingBenignDecisions: count(r => r.expectedDecision === 'ALLOW' && r.decision === null),
      missingProtectedDecisions: count(r => r.expectedDecision !== 'ALLOW' && r.decision === null),
      falseBlocks: rate(count(r => r.falseBlock), count(r => r.expectedDecision === 'ALLOW' && r.decision !== null)),
      unsafeAllows: rate(count(r => r.unsafeAllow), count(r => r.expectedDecision !== 'ALLOW' && r.decision !== null)),
      semanticMisclassifications: rate(count(r => r.semanticMisclassification), count(r => r.status === 'scripted' && r.semanticComparable)),
      uncertaintyOnlyBlocks: rate(count(r => r.uncertaintyOnlyBlock), count(r => r.status === 'scripted')),
      unnecessaryApprovals: rate(count(r => r.unnecessaryApproval), count(r => r.expectedDecision === 'ALLOW' && r.decision !== null)) };
  }));
  return { corpusVersion: applicabilityCorpus.version, corpusDigest: applicabilityCorpusDigest,
    evidenceKind: 'offline-scripted-mechanics-only', semanticAccuracy: 'unverified', automaticPromotion: false,
    fixtureActionsExecuted: false, summaries, rows };
}
