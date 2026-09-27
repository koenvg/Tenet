import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, validateAssessment } from '../src/decision/decide.js';
import { createJevJudge } from '../src/decision/jev.js';
import { buildQuestions } from '../src/decision/questions.js';
import { captureAction } from '../src/decision/evidence.js';
import { currentFactReferences } from '../src/decision/assessment-contract.js';
import { ActionResolution } from '../src/runtime/resolved-action.js';
import { answer, policy } from './helpers.js';
import { ruleContributions } from '../src/recording/rules.js';
import { invocationView } from '../src/inspector/view.js';
import { confidenceReadings } from '../inspector/src/presentation.js';
import type { ArchiveRecord } from '../src/recording/contract.js';
import { mapChecks } from '../inspector/src/decision-map.js';
import { recoverReport } from '../src/pi/report-history.js';
import { readConfig } from '../src/runtime/config.js';

const action = captureAction({ sessionId: 's', callId: 'c', toolName: 'fixture', arguments: { path: '/fixture/code.ts' } });
async function request() {
  const resolution = new ActionResolution({ id: 'fixture', version: '1', semantics: ['file-read'],
    resolve: async ({ binding }) => ({ version: 1, binding, integration: { id: 'fixture', version: '1' }, resolverState: '1', coverage: 'complete', limitations: [],
      operations: [{ id: 'read', semantics: 'file-read', resources: [{ requested: '/fixture/code.ts', resolved: '/fixture/code.ts', identity: '1', relation: 'direct' }], content: [] }] }),
    revalidate: async () => null });
  const resolved = await resolution.capture({ host: 'fixture', contextId: 'main', invocationId: 'invocation', cwd: '/fixture', sessionId: 's', callId: 'c', toolName: 'fixture', argumentDigest: action.argumentDigest }, action.arguments, [], new AbortController().signal);
  return { profile: 'applicability-v1' as const, policy, action, cwd: '/fixture', deadlineMs: 2500, resolvedAction: resolved.evidence };
}
function rawResponse(ref: string) {
  return { model: 'offline-provider', answers: {
    rule_0_outcome: { type: 'choice', confidence: 0.9, choice: 'NOT_APPLICABLE', probabilities: { PASS: 0.1, APPROVAL_REQUIRED: 0, FAIL: 0, UNKNOWN: 0, NOT_APPLICABLE: 0.9 } },
    rule_0_evidence: { type: 'choice', confidence: 1, choice: 'INSUFFICIENT', probabilities: { SUFFICIENT: 0, INSUFFICIENT: 1 } },
    rule_0_facts: { type: 'choice', confidence: 1, choice: ref, probabilities: { NONE: 0, [ref]: 1 } },
    rule_1_outcome: { type: 'choice', confidence: 1, choice: 'PASS', probabilities: { PASS: 1, APPROVAL_REQUIRED: 0, FAIL: 0, UNKNOWN: 0 } },
    rule_1_evidence: { type: 'choice', confidence: 1, choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } },
  } };
}

test('candidate SDK mapping records fact references and genuinely absent evidence at exact threshold', async () => {
  const req = await request(), refs = currentFactReferences(req.resolvedAction)!;
  let payload: any;
  const judge = createJevJudge({ apiKey: 'offline', fetch: async (_url, init) => { payload = JSON.parse(init!.body as string); return Response.json(rawResponse(refs.digest)); } });
  const result = await decide({ ...req, judge });
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.questionVersion, 'policy-rules-v6-applicability');
  assert.equal(result.assessment!.rules[0]!.evidence, null);
  assert.deepEqual(result.assessment!.rules[0]!.factReferences, refs);
  assert.equal(payload.state.profile, 'applicability-v1');
  assert.ok(payload.questions.rule_0_facts.criteria[refs.digest]);
  assert.equal(payload.questions.rule_1_outcome.criteria.NOT_APPLICABLE, undefined);
  const records = [
    { stage: 'begin', data: { profile: req.profile, policy, integrity: { id: result.assessment!.rules[1]!.ruleId }, config: result.config } },
    { stage: 'assessment', data: { assessment: result.assessment } },
    { stage: 'decision', data: { ...result, contributions: ruleContributions(result, policy) } },
  ].map((r, i) => ({ ...r, schemaVersion: 3, timestamp: 1, host: 'fixture', contextId: 'main',
    sessionId: 's', invocationId: 'invocation', callId: 'c', toolName: 'fixture', cwd: '/fixture', mode: 'enforce',
    writerId: '00000000-0000-0000-0000-000000000000', eventId: '00000000-0000-0000-0000-000000000000', sequence: i + 1 })) as ArchiveRecord[];
  const view = invocationView(records);
  assert.equal(view.assessmentProfile, 'applicability-v1');
  assert.equal(view.rules[0]!.thresholds.evidenceThreshold, null);
  assert.equal(view.rules[0]!.evidenceGate, 'not-applicable');
  assert.equal(view.rules[0]!.result!.evidence, null);
  assert.deepEqual(confidenceReadings(view.rules[0]!), []);
  assert.deepEqual(mapChecks(view.rules[0]).map(check => [check.id, check.unknown]), [['outcome', false]]);
  assert.equal(invocationView([{ ...records[0]!, data: { policy } }]).assessmentProfile, 'legacy (historical)');
  const historical = structuredClone(records);
  historical[0]!.data.profile = 'legacy';
  historical[0]!.data.questionVersion = 'policy-rules-v5-resolved-action';
  historical[1]!.data.assessment = { model: 'archived-model', rules: [{ ruleId: policy.rules[0]!.id,
    outcome: { choice: 'PASS', probabilities: { PASS: 0.94, FAIL: 0.02, UNKNOWN: 0.02, APPROVAL_REQUIRED: 0.02 } },
    evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 0.93, INSUFFICIENT: 0.07 } } }] };
  historical[2]!.data = { decision: 'ALLOW', reason: 'all-rules-pass', profile: 'legacy',
    contributions: [{ ruleId: policy.rules[0]!.id, profile: 'legacy', gates: [], contribution: 'pass', effectThreshold: 0.9, evidenceThreshold: 0.8 }] };
  const unchanged = JSON.stringify(historical);
  const oldView = invocationView(historical);
  assert.equal(oldView.assessmentProfile, 'legacy');
  assert.equal(oldView.questionVersion, 'policy-rules-v5-resolved-action');
  assert.equal(oldView.rules[0]!.thresholds.evidenceThreshold, 0.8);
  assert.equal(oldView.rules[0]!.result!.outcome.probabilities.NOT_APPLICABLE, undefined);
  assert.equal(oldView.rules[0]!.result!.evidence.probabilities.SUFFICIENT, 0.93);
  assert.equal(JSON.stringify(historical), unchanged);
});

test('candidate response schema, reference distribution and even ignored evidence remain strictly validated', async () => {
  const req = await request(), refs = currentFactReferences(req.resolvedAction)!;
  const mutations: ((raw: any) => void)[] = [
    r => delete r.answers.rule_0_facts,
    r => r.answers.rule_0_facts.probabilities[refs.digest] = 0.99,
    r => r.answers.rule_0_facts.choice = 'old-facts',
    r => delete r.answers.rule_0_outcome.probabilities.NOT_APPLICABLE,
    r => r.answers.rule_0_evidence.probabilities.SUFFICIENT = -1,
    r => r.answers.rule_1_outcome.probabilities.NOT_APPLICABLE = 0,
  ];
  for (const mutate of mutations) {
    const raw = rawResponse(refs.digest); mutate(raw);
    const result = await decide({ ...req, judge: createJevJudge({ apiKey: 'offline', fetch: async () => Response.json(raw) }) });
    assert.equal(result.reason, 'invalid-response');
  }
  assert.throws(() => validateAssessment({ ...answer(policy), profile: 'legacy' }, policy));
  const legacy = answer(policy);
  delete legacy.rules[0]!.outcome.probabilities.NOT_APPLICABLE;
  assert.throws(() => validateAssessment(legacy, policy, req));
});

test('unsupported candidate response can be valid but cannot clear a BLOCK rule', async () => {
  const req = await request();
  const raw = rawResponse('unused');
  raw.answers.rule_0_facts = { type: 'choice', confidence: 1, choice: 'NONE', probabilities: { NONE: 1 } } as any;
  const result = await decide({ ...req, resolvedAction: undefined, judge: createJevJudge({ apiKey: 'offline', fetch: async () => Response.json(raw) }) });
  assert.equal(result.decision, 'BLOCK');
  assert.deepEqual(result.diagnostics[0]!.gates, ['applicability-unresolved']);
});

test('candidate questions are generic and do not contain confidence thresholds', async () => {
  const req = await request();
  const questions = buildQuestions(policy, req.resolvedAction);
  assert.deepEqual(questions, buildQuestions({ ...policy, rules: policy.rules.map(r => ({ ...r, text: 'Only publish with approval.', evidenceThreshold: 0.5 })) }, req.resolvedAction));
  assert.doesNotMatch(JSON.stringify(questions), /Git|0\.90|0\.5|publication|database|email/i);
});

test('obsolete profile values have no effect on current configuration', () => {
  for (const value of ['', 'legacy', 'candidate']) assert.deepEqual(readConfig('/fixture', { TENET_ASSESSMENT_PROFILE: value }), readConfig('/fixture', {}));
});

test('historical owner reports preserve nullable applicability diagnostics only under the candidate profile', async () => {
  const req = await request();
  const raw = rawResponse('unused');
  raw.answers.rule_0_facts = { type: 'choice', confidence: 1, choice: 'NONE', probabilities: { NONE: 1 } } as any;
  const result = await decide({ ...req, resolvedAction: undefined, judge: createJevJudge({ apiKey: 'offline', fetch: async () => Response.json(raw) }) });
  const data = { version: 3, stage: 'permission', profile: 'applicability-v1', mode: 'enforce', outcome: 'blocked', wouldDecision: 'BLOCK',
    assessmentAvailable: true, reason: result.reason, callId: 'c', toolName: 'fixture', invocationId: 'i', rules: [], diagnostics: result.diagnostics, ruleIds: result.ruleIds, approvalRules: [] };
  const recovered = recoverReport({ type: 'custom', customType: 'tenet', data });
  assert.equal(recovered!.profile, 'applicability-v1');
  assert.equal(recovered!.diagnostics[0]!.evidenceProbability, null);
  assert.equal(recoverReport({ type: 'custom', customType: 'tenet', data: { ...data, profile: 'legacy' } }), undefined);
});
