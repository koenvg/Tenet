import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createApusJudge } from '../src/decision/apus.js';
import { captureAction } from '../src/decision/evidence.js';
import { assessmentDecision, validateAssessment, DEFAULTS } from '../src/decision/decide.js';
import { policy } from './helpers.js';
import { recordedInputs, recordedSubmissions } from '../src/recording/scoped.js';
import { nativeHistory, validNativeCapture } from '../src/recording/native.js';
import type { ArchiveRecord } from '../src/recording/contract.js';

const { scriptedNative, alias, baseUrl } = await import(pathToFileURL(resolve('scripts/fixtures/archive-native.mjs')).href);
const request = { policy, cwd: '/synthetic/archive', deadlineMs: 5000,
  action: captureAction({ sessionId: 'archive', callId: 'native', toolName: 'inert', arguments: { text: 'literal only' } }) };

async function run() {
  const native = scriptedNative();
  const records: { stage: string; data: any }[] = [];
  const result = await createApusJudge({ baseUrl, model: alias, fetch: native.fetch })(request,
    new AbortController().signal, (stage, data) => { records.push({ stage, data }); });
  return { native, records, result: validateAssessment(result, policy) };
}

test('archive native helper emits current identities, exact scoped submissions and honest deterministic provenance', async () => {
  const { native, records, result } = await run();
  const data = records.find(r => r.stage === 'request')!.data;
  assert.equal(data.questionVersion, 'policy-rules-v9-scoped');
  assert.equal(data.inputVersion, 'judge-input-scopes-v1');
  assert.equal(data.nativeContract.version, 'apus-recording-v2');
  assert.equal(result.profile, 'applicability-v1');
  assert.equal(assessmentDecision(result, DEFAULTS, policy).decision, 'ALLOW');
  const inputs = recordedInputs(data);
  assert.equal(inputs.layout, 'scoped'); assert.equal(inputs.sharedState, null);
  assert.deepEqual(inputs.scopes.map(s => s.id), ['ordinary:0', 'exemption:0', 'policy-protection']);
  assert.deepEqual(Object.keys(inputs.scopes[0]!.state), ['rule', 'thinkingTrace', 'previousToolCall', 'proposedToolCall']);
  assert.deepEqual(data.evidenceContext.scopes, inputs.scopes.map(s => ({ id: s.id, fields: Object.keys(s.state), stateBytes: s.stateBytes })));
  assert.equal(data.evidenceContext.history, null);
  const submissions = recordedSubmissions(records);
  for (const status of ['attempted', 'completed']) {
    const submitted = submissions.filter(s => s.status === status);
    assert.equal(submitted.length, 4);
    for (const submission of submitted) {
      assert.ok('payload' in submission && submission.payload);
      assert.deepEqual(submission.payload.state, inputs.scopes.find(s => s.id === submission.scopeId)!.state);
      assert.deepEqual(Object.keys(submission.payload.questions), submission.questionKeys);
    }
  }
  assert.deepEqual(submissions.filter(s => s.status === 'unavailable').map(s => 'reason' in s && s.reason), ['deterministic-NONE-no-native-request']);
  assert.equal(native.calls.filter((c: any) => c.path === '/completion').length, 4);
  const history = nativeHistory(records as ArchiveRecord[])!;
  assert.deepEqual(history.requests.map(r => r.scopeId), ['ordinary:0', 'ordinary:0', 'policy-protection', 'policy-protection']);
  assert.equal(history.deterministic[0]!.scopeId, 'exemption:0');
  assert.equal(history.deterministic[0]!.modelConfidence, false);
  assert.equal(history.deterministic[0]!.authenticatedCoverage, false);
  assert.equal(history.deterministic[0]!.nativeScoringRequests, 0);
  for (const record of records) assert.equal(validNativeCapture(record.stage, record.data), true);
  const bad = structuredClone(records);
  bad.find(r => r.data.value?.status === 'attempted')!.data.value.scopeId = 'exemption:0';
  assert.equal(recordedSubmissions(bad)[0]!.status, 'unavailable');
});

for (const defect of ['http', 'probability'] as const) test(`archive native ${defect} failure stops without a completed validation or fallback`, async () => {
  const native = scriptedNative(); let completions = 0;
  const records: { stage: string; data: any }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const response = await native.fetch(url, init);
    if (new URL(String(url)).pathname !== '/completion') return response;
    completions++;
    if (defect === 'http') return new Response('private-scripted-error', { status: 503 });
    const raw = await response.json(); raw.completion_probabilities = [];
    return Response.json(raw);
  };
  await assert.rejects(createApusJudge({ baseUrl, model: alias, fetch: fetcher })(request,
    new AbortController().signal, (stage, data) => { records.push({ stage, data }); }),
  new RegExp(defect === 'http' ? 'provider-error' : 'invalid-response'));
  assert.equal(completions, 1);
  assert.ok(!records.some(r => r.stage === 'validation' && r.data.valid === true));
  assert.ok(recordedSubmissions(records).some(s => s.status === 'unavailable'));
});

test('frozen historical shared native-v1 capture keeps its recorded interpretation without relabeling', () => {
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/judge-prompts/v8-read-00.json', import.meta.url), 'utf8'));
  const nativeContract = { version: 'apus-recording-v1', renderingVersion: 'jev.dynamic.prompt.v2',
    rendererRevision: '7389d774472c9e29ddc84fffb392951f0f25de74', protocolVersion: 'llamacpp-b11118-choice-v1' };
  const data = { provider: 'apus-llamacpp', requestedModel: alias, nativeContract,
    renderingVersion: nativeContract.renderingVersion, rendererRevision: nativeContract.rendererRevision,
    questionVersion: 'policy-rules-v8-source-set', payload: { model: alias, state: baseline.state, questions: baseline.questions } };
  const records: ArchiveRecord[] = [{ schemaVersion: 1, sessionId: 'historical', invocationId: 'native-v1',
    callId: 'native-v1', toolName: 'read', cwd: '/synthetic/historical', mode: 'observe',
    writerId: 'historical-fixture', sequence: 0, eventId: 'historical-native-v1', timestamp: 1, stage: 'request', data }];
  const before = JSON.stringify(records);
  assert.equal(validNativeCapture('request', data), true);
  assert.equal(recordedInputs(data).layout, 'shared');
  assert.deepEqual(recordedInputs(data).sharedState, baseline.state);
  assert.equal(nativeHistory(records)!.contract.version, 'apus-recording-v1');
  assert.deepEqual(recordedSubmissions(records), []);
  assert.equal(validNativeCapture('request', { ...data, nativeContract: { ...nativeContract, version: 'apus-recording-v2' } }), false);
  assert.equal(JSON.stringify(records), before);
});
