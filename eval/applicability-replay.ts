import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import { currentFactReferences, ASSESSMENT_METADATA } from '../src/decision/assessment-contract.js';
import { ruleContributions } from '../src/recording/rules.js';
import { ActionResolution } from '../src/runtime/resolved-action.js';
import { applicabilityCorpus, fixtureIdentity, type ApplicabilityFixture } from './applicability-fixtures.js';
import { compareApplicability, type ComparisonObservation } from './applicability-comparison.js';

// Deliberately scripted judgments exercise mechanics, not model semantics.
async function replay(fixture: ApplicabilityFixture): Promise<ComparisonObservation> {
  const identity = fixtureIdentity(fixture);
  const policy = { available: true as const, source: '/fixture/TENET.md', target: '/fixture/TENET.md', digest: identity.policyDigest,
    rules: [{ id: `${identity.policyDigest}:1`, line: 1, text: fixture.policy.replace(/^Rule; BLOCK; /, ''), enforcement: 'BLOCK' as const }] };
  const action = captureAction({ sessionId: 'offline', callId: fixture.id, toolName: 'fixture-description', arguments: { description: fixture.action } });
  const resolver = new ActionResolution({ id: 'offline-fixture-only', version: '1', semantics: ['file-read', 'file-edit'],
    resolve: async ({ binding }) => fixture.coverage === 'complete' ? { version: 1, binding,
      integration: { id: 'offline-fixture-only', version: '1' }, resolverState: identity.fixtureDigest, coverage: 'complete', limitations: [],
      operations: [{ id: 'fixture-operation', semantics: ['brace-insertion', 'code-edit', 'doc-edit', 'policy-mutation'].includes(fixture.id) ? 'file-edit' : 'file-read',
        resources: [{ requested: fixture.id === 'policy-mutation' ? '/fixture/TENET.md' : '/fixture/resource',
          resolved: fixture.id === 'policy-mutation' ? '/fixture/TENET.md' : '/fixture/resource', identity: 'frozen-fixture', relation: 'direct' }],
        before: 'frozen before content', after: 'frozen after content', content: [{ role: 'literal', value: fixture.action }] }] } : null,
    revalidate: async () => null });
  const resolved = await resolver.capture({ host: 'offline', sessionId: 'offline', contextId: 'fixture', invocationId: fixture.id,
    callId: fixture.id, toolName: action.toolName, argumentDigest: action.argumentDigest, cwd: '/fixture' }, action.arguments, [], new AbortController().signal);
  const refs = currentFactReferences(resolved.evidence);
  const selected = fixture.expectedOutcome === 'unavailable' ? 'PASS' : fixture.expectedOutcome;
  const distribution = (choice: string, labels: string[]) => ({ choice, probabilities: Object.fromEntries(labels.map(label => [label, label === choice ? 1 : 0])) });
  const result = await decide({ policy, action, cwd: '/fixture', resolvedAction: resolved.evidence, judge: async () => ({
    ...ASSESSMENT_METADATA, model: 'offline-scripted-not-a-model', rules: [
      { ruleId: policy.rules[0]!.id,
        outcome: distribution(selected, ['PASS', 'APPROVAL_REQUIRED', 'FAIL', 'UNKNOWN', 'NOT_APPLICABLE']),
        evidence: selected === 'NOT_APPLICABLE' ? null
          : fixture.expectedOutcome === 'unavailable' ? { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 0.99, INSUFFICIENT: 0 } }
          : distribution('SUFFICIENT', ['SUFFICIENT', 'INSUFFICIENT']),
        ...(selected === 'NOT_APPLICABLE' ? { factReferences: refs ?? { digest: 'NONE', operationIds: [] } } : {}) },
      { ruleId: INTEGRITY_ID, outcome: distribution('expectedIntegrity' in fixture ? fixture.expectedIntegrity : 'PASS', ['PASS', 'APPROVAL_REQUIRED', 'FAIL', 'UNKNOWN']),
        evidence: distribution('SUFFICIENT', ['SUFFICIENT', 'INSUFFICIENT']) },
    ],
  }) });
  return { ...identity, ...ASSESSMENT_METADATA, evidenceCoverage: resolved.evidence.status, omissions: [], result, contributions: ruleContributions(result, policy) };
}
export async function scriptedApplicabilityComparison() {
  const observations: ComparisonObservation[] = [];
  for (const fixture of applicabilityCorpus.fixtures) observations.push(await replay(fixture));
  return compareApplicability(observations);
}
if (import.meta.main) console.log(JSON.stringify(await scriptedApplicabilityComparison(), null, 2));
