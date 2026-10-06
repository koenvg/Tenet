import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { JudgeRequest } from '../src/decision/contracts.js';
import { decide } from '../src/decision/decide.js';
import { captureAction, argumentDigest } from '../src/decision/evidence.js';
import { judgeState } from '../src/decision/judge-evidence.js';
import { buildQuestions } from '../src/decision/questions.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import { currentFactReferences, ASSESSMENT_METADATA } from '../src/decision/assessment-contract.js';
import { ruleContributions } from '../src/recording/rules.js';
import { ActionResolution } from '../src/runtime/resolved-action.js';
import { applicabilityCorpus, fixtureIdentity, type ApplicabilityFixture } from './applicability-fixtures.js';
import { compareApplicability, renderApplicabilityReport, type ComparisonObservation, type ComparisonContract } from './applicability-comparison.js';
import { fixturePolicy } from './generic-rule-fixtures.js';

// Deliberately scripted judgments exercise mechanics, not model semantics.
async function replay(fixture: ApplicabilityFixture): Promise<ComparisonObservation> {
  const identity = fixtureIdentity(fixture);
  const policy = fixturePolicy({ id: fixture.id, sourceText: fixture.policy, rules: [fixture.policy.replace(/^Rule; BLOCK; /, '')], outcomes: [],
    integrity: 'PASS', expectedDecision: 'ALLOW', input: { toolName: 'fixture-description', arguments: {} } });
  const ordinary = 'ordinaryInput' in fixture ? fixture.ordinaryInput : null;
  const action = { ...captureAction({ sessionId: 'offline', callId: fixture.id, toolName: 'fixture-description',
    description: ordinary?.description, parameters: ordinary ? { type: 'object',
      ...('schemaBytes' in ordinary ? { description: 's'.repeat(ordinary.schemaBytes) } : {}) } : undefined,
    arguments: ordinary?.arguments ?? { description: fixture.action } }), timestamp: 2000 };
  const trajectory = ordinary && 'historyBytes' in ordinary ? { observations: [0, 1, 2].map(i => ({
    sessionId: 'offline', callId: `prior-${i}`, toolName: 'fixture-description', origin: 'tool-result', timestamp: i,
    data: { text: String(i).repeat(ordinary.historyBytes) } })), omitted: 0, limitations: [] } : undefined;
  let submitted: JudgeRequest | undefined;
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
  const result = await decide({ policy, action, cwd: '/fixture', resolvedAction: resolved.evidence, trajectory,
    clock: { now: () => 0, schedule: () => () => {} },
    evidenceLimits: ordinary && 'maxBytes' in ordinary ? { maxBytes: ordinary.maxBytes, recentEvents: 12 } : undefined,
    judge: async request => {
      submitted = request;
      return { ...ASSESSMENT_METADATA, model: 'offline-scripted-not-a-model', rules: [
        { ruleId: policy.rules[0]!.id,
          outcome: distribution(selected, ['PASS', 'APPROVAL_REQUIRED', 'FAIL', 'UNKNOWN', 'NOT_APPLICABLE']),
          evidence: selected === 'NOT_APPLICABLE' ? null
            : fixture.expectedOutcome === 'unavailable' ? { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 0.99, INSUFFICIENT: 0 } }
            : distribution('SUFFICIENT', ['SUFFICIENT', 'INSUFFICIENT']),
          ...(selected === 'NOT_APPLICABLE' ? { factReferences: refs ?? { digest: 'NONE', operationIds: [] } } : {}) },
        { ruleId: INTEGRITY_ID, outcome: distribution('expectedIntegrity' in fixture ? fixture.expectedIntegrity : 'PASS', ['PASS', 'APPROVAL_REQUIRED', 'FAIL', 'UNKNOWN']),
          evidence: distribution('SUFFICIENT', ['SUFFICIENT', 'INSUFFICIENT']) },
      ] };
    } });
  const state = submitted ? judgeState(submitted) : null;
  const questions = submitted ? buildQuestions(policy, resolved.evidence) : null;
  const omissions = [...(submitted?.action.limitations ?? []), ...(submitted?.trajectory?.limitations ?? []),
    ...(submitted?.trajectory?.omitted ? [`history-omitted:${submitted.trajectory.omitted}`] : [])];
  return { ...identity, ...ASSESSMENT_METADATA, origin: 'current-inputs-scripted-response',
    questionDigest: questions ? argumentDigest(questions) : undefined,
    payloadDigest: state ? argumentDigest({ state, questions }) : undefined, submittedState: state,
    evidenceCoverage: resolved.evidence.status, omissions, result, contributions: ruleContributions(result, policy) };
}
export const BEFORE_CONTRACT = { profile: 'applicability-v1', questionVersion: 'policy-rules-v7-evidence-selection' };
export async function scriptedApplicabilityComparison(before: { contract: ComparisonContract; observations: readonly ComparisonObservation[] } = { contract: BEFORE_CONTRACT, observations: [] }) {
  const observations: ComparisonObservation[] = [...before.observations];
  for (const fixture of applicabilityCorpus.fixtures) observations.push(await replay(fixture));
  return compareApplicability(observations, [before.contract, ASSESSMENT_METADATA]);
}

// Offline-only output. Unknown flags, including --live, fail before replay.
export async function runApplicabilityComparison(args: string[]) {
  if (args.some(a => a !== '--format=markdown' && !a.startsWith('--before='))
    || args.filter(a => a.startsWith('--before=')).length > 1) throw new Error('Offline only. Supply --before=SANITIZED_JSON or --format=markdown. No requests sent.');
  const file = args.find(a => a.startsWith('--before='))?.slice('--before='.length);
  const before = file !== undefined ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  if (file !== undefined && (!before || !before.contract || !Array.isArray(before.observations))) throw new Error('invalid-supplied-comparison');
  const report = await scriptedApplicabilityComparison(before);
  return args.includes('--format=markdown') ? renderApplicabilityReport(report) : JSON.stringify(report, null, 2) + '\n';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runApplicabilityComparison(process.argv.slice(2)).then(output => process.stdout.write(output))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
