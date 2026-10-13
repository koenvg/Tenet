import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureScopedPlan, captureScopedSubmission } from '../src/recording/scoped-capture.js';
import { recordedSubmissions, validScopedRequest } from '../src/recording/scoped.js';
import { validNativeCapture, APUS_V2 } from '../src/recording/native.js';
import { validEvidenceContext } from '../src/decision/evidence-context-contract.js';
import { scopedFixture } from './scoped-recording-fixture.js';

async function planned() {
  const { request, plan, questions } = await scopedFixture();
  const records: { stage: string; data: Record<string, any> }[] = [];
  const sink = (stage: any, data: any) => { records.push({ stage, data }); };
  captureScopedPlan(sink, request, plan, questions, { provider: 'typesafe', model: 'offline' });
  return { request, plan, questions, records, sink };
}

test('exact application bytes preserve redacted field keys and literal UTF-8 strings', async () => {
  const h = await planned(), g = h.plan.groups[0]!;
  const state = structuredClone(g.state) as any;
  state.proposedToolCall.arguments = { token: '[REDACTED]', text: '界🙂' };
  const payloadJson = JSON.stringify({ model: 'offline', state, questions: Object.fromEntries(g.questionKeys.map(k => [k, h.questions[k]])) });
  captureScopedSubmission(h.sink, { submissionId: 'ordinary', scopeId: g.id, status: 'attempted', questionKeys: g.questionKeys,
    payloadJson } as any);
  const raw = h.records[1]!.data.value;
  assert.equal(raw.payloadJson, payloadJson);
  assert.equal(raw.payloadBytes, Buffer.byteLength(payloadJson));
  assert.equal(raw.stateBytes, Buffer.byteLength(JSON.stringify(state)));
  // A different state cannot be attributed to the prepared scope by its ID.
  assert.equal(recordedSubmissions(h.records)[0]!.status, 'unavailable');
});

test('request mapping cannot omit a mandatory check or swap its recorded scope', async () => {
  const h = await planned(), d = h.records[0]!.data;
  for (const alter of [(v: any) => { v.mapping = []; }, (v: any) => { v.mapping[0].outcomeKey = v.mapping[1].outcomeKey; },
    (v: any) => { v.payload.scopes[0].ruleId = v.integrity.id; }, (v: any) => { v.mapping[0].id = 'wrong-rule'; }]) {
    const bad = structuredClone(d); alter(bad); assert.equal(validScopedRequest(bad), false);
  }
});

test('native v1/v2 capture identities reject the opposite layout', async () => {
  const h = await planned(), d = h.records[0]!.data;
  const identity = { provider: 'apus-llamacpp', requestedModel: 'offline', renderingVersion: APUS_V2.renderingVersion, rendererRevision: APUS_V2.rendererRevision };
  assert.equal(validNativeCapture('request', { ...d, ...identity, nativeContract: { ...APUS_V2, version: 'apus-recording-v1' } }), false);
  assert.equal(validNativeCapture('request', { ...d, ...identity, nativeContract: APUS_V2 }), true);
  assert.equal(validNativeCapture('request', { ...identity, payload: { model: 'offline', state: {} }, nativeContract: APUS_V2 }), false);
});

test('scoped metadata version cannot claim bounded-history counters or a wrong scope byte count', async () => {
  const h = await planned(), c = h.records[0]!.data.evidenceContext;
  assert.equal(validEvidenceContext(c), true);
  assert.equal(validEvidenceContext({ ...c, version: 'evidence-context-v1' }), false);
  assert.equal(validEvidenceContext({ ...c, history: { retainedEvents: 1 } }), false);
  assert.equal(validEvidenceContext({ ...c, totalStateBytes: c.totalStateBytes + 1 }), false);
});

test('recorded confirmation is bound to its protected scope and original authenticated facts', async () => {
  const { request, questions } = await scopedFixture();
  const { prepareJudgeScopes } = await import('../src/decision/judge-evidence.js');
  const resolvedAction = { status: 'authenticated-complete' as const, redactedFields: 0, limitations: [], facts: { version: 1 as const,
    binding: { host: 'fixture', sessionId: request.action.sessionId, contextId: 'fixture', invocationId: 'fixture',
      callId: request.action.callId, toolName: request.action.toolName, argumentDigest: request.action.argumentDigest, cwd: request.cwd },
    integration: { id: 'fixture', version: '1' }, resolverState: 'synthetic', coverage: 'complete' as const, limitations: [],
    operations: [{ id: 'read-1', semantics: 'file-read' as const, resources: [{ requested: '/synthetic/README.md', resolved: '/synthetic/README.md',
      identity: 'revision-1', relation: 'direct' as const }], content: [{ role: 'literal' as const, value: 'protected-marker' }] }] } };
  const plan = prepareJudgeScopes({ ...request, resolvedAction })!;
  const records: { stage: string; data: Record<string, any> }[] = [];
  const sink = (stage: any, data: any) => { records.push({ stage, data }); };
  captureScopedPlan(sink, { ...request, resolvedAction }, plan, questions, { provider: 'typesafe', model: 'offline' });
  const group = plan.groups[1]!, key = 'rule_0_confirmation';
  const confirmation = { ordinaryQuestion: 'rule_0_outcome', confirmationQuestion: key, trigger: 'NOT_APPLICABLE' as const,
    factsReference: (group.state as any).allowedFactReferences.digest };
  captureScopedSubmission(sink, { submissionId: 'confirmation', scopeId: group.id, questionKeys: [key], confirmation, status: 'attempted',
    payloadJson: JSON.stringify({ model: 'offline', state: group.state, questions: { [key]: { type: 'choice',
      instructions: 'Authored fixture: complete facts must place the entire invocation outside the rule.', criteria: { NOT_APPLICABLE: 'Confirmed.', UNKNOWN: 'Uncertain.' } } } }) });
  captureScopedSubmission(sink, { submissionId: 'confirmation', scopeId: group.id, questionKeys: [key], confirmation, status: 'unavailable', reason: 'timeout' });
  const submissions = recordedSubmissions(records);
  assert.equal(submissions[0]!.status, 'attempted');
  assert.equal(submissions[1]!.status, 'unavailable');
  assert.deepEqual((submissions[0] as any).confirmation, confirmation);
  assert.doesNotMatch(JSON.stringify(plan.groups[0]!.state), /protected-marker|resolvedAction|allowedFactReferences/);
  for (const alter of [(v: any) => { v.confirmation.factsReference = 'a'.repeat(64); },
    (v: any) => { v.confirmation.ordinaryQuestion = 'rule_1_outcome'; }, (v: any) => { v.scopeId = 'ordinary:0'; }]) {
    const bad = structuredClone(records); alter(bad[1]!.data.value);
    assert.equal(recordedSubmissions(bad)[0]!.status, 'unavailable');
    assert.ok(!('payload' in recordedSubmissions(bad)[0]!));
  }
});

test('partial or structurally changed scope submissions never become exact input evidence', async () => {
  const h = await planned(), g = h.plan.groups[0]!;
  captureScopedSubmission(h.sink, { submissionId: 'ordinary', scopeId: g.id, questionKeys: g.questionKeys, status: 'attempted',
    payloadJson: JSON.stringify({ model: 'offline', state: g.state, questions: Object.fromEntries(g.questionKeys.map(k => [k, h.questions[k]])) }) });
  assert.equal(recordedSubmissions(h.records)[0]!.status, 'attempted');
  assert.equal(h.records[1]!.data.value.payloadBytes, Buffer.byteLength(h.records[1]!.data.value.payloadJson));
  for (const alter of [(d: any) => { d.omittedFields++; }, (d: any) => { d.value.scopeId = 'unrecorded'; },
    (d: any) => { d.value.payloadBytes++; }, (d: any) => { d.value.stateBytes++; }]) {
    const bad = structuredClone(h.records); alter(bad[1]!.data);
    assert.equal(recordedSubmissions(bad)[0]!.status, 'unavailable');
  }
});
