import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { readArchive } from '../src/recording/archive.js';
import { validRecord, responseSnapshot } from '../src/recording/contract.js';
import { invocationView } from '../src/inspector/view.js';
import { validNativeContract, APUS_V2 } from '../src/recording/native.js';
import { captureScopedPlan, captureScopedSubmission } from '../src/recording/scoped-capture.js';
import { recordedInputs, validScopedRequest } from '../src/recording/scoped.js';
import { recordScopedFixture, scopedFixture } from './scoped-recording-fixture.js';

for (const native of [true, false]) test(`inactive ${native ? 'APUS' : 'JEV'} scoped capture roundtrip separates exact prepared and attempted inputs`, async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet108-record-'));
  try {
    await recordScopedFixture(root, native);
    const archive = await readArchive(root);
    assert.deepEqual(archive.issues, []);
    assert.ok(archive.records.every(validRecord));
    const view = invocationView(archive.records);
    assert.equal(view.inputLayout, 'scoped');
    assert.equal(view.evidence, null);
    assert.equal(view.inputScopes.length, 3);
    assert.equal(view.submissions.filter(s => s.status === 'attempted').length, 3);
    assert.equal(view.judge.requestedModel, 'scripted-scoped');
    assert.equal(view.judge.returnedModel, 'scripted-scoped');
    assert.equal(view.rules[0]!.thresholds.effectThreshold, .91);
    assert.equal(view.rules[0]!.thresholds.evidenceThreshold, .93);
    assert.equal(view.execution, 'unknown');
    assert.equal(view.native?.contract.version ?? null, native ? 'apus-recording-v2' : null);

    if (native) {
      assert.deepEqual(view.native!.requests.map(r => r.scopeId), view.inputScopes.map(s => s.id));
      assert.equal(view.native!.responses.length, 3);
      assert.deepEqual(view.native!.requests[0]!.labelIds, { A: 32, B: 33 });
    }
    const ordinary = view.inputScopes[0]!;
    assert.deepEqual(Object.keys(ordinary.state).sort(), ['previousToolCall', 'proposedToolCall', 'rule', 'thinkingTrace']);
    assert.ok(!JSON.stringify(ordinary.state).includes('/synthetic/TENET.md'));
    assert.ok(!JSON.stringify(archive.records.find(r => r.stage === 'request')!.data.payload).includes('trajectory'));
    for (const s of view.submissions) if ('payload' in s && s.payload) {
      assert.deepEqual(s.payload.state, view.inputScopes.find(g => g.id === s.scopeId)!.state);
      assert.deepEqual(Object.keys(s.payload.questions), s.questionKeys);
    }
    const before = JSON.stringify(archive.records);
    assert.deepEqual(invocationView(archive.records), view);
    assert.equal(JSON.stringify(archive.records), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('scoped layout dispatch rejects mixed, unknown versions and false byte accounting', async () => {
  const { request, plan, questions } = await scopedFixture();
  let data: any;
  captureScopedPlan((_, d) => { data = d; }, request, plan, questions, { provider: 'typesafe', model: 'offline' });
  assert.equal(validScopedRequest(data), true);
  for (const alter of [(d: any) => { d.inputVersion = 'future'; }, (d: any) => { d.questionVersion = 'policy-rules-v8-source-set'; },
    (d: any) => { d.payload.state = { trajectory: 'unused-history' }; }, (d: any) => { d.payload.scopes[0].stateBytes++; },
    (d: any) => { d.payload.scopes[0].state.resolvedAction = 'protected-sibling'; }]) {
    const bad = structuredClone(data); alter(bad);
    assert.equal(validScopedRequest(bad), false);
    assert.equal(recordedInputs(bad).layout, 'unavailable');
  }
  assert.equal(validNativeContract(APUS_V2), true);
  assert.equal(validNativeContract({ ...APUS_V2, protocolVersion: 'new-protocol' }), false);
});

test('conditional confirmation provenance and failed/unavailable attempts remain separately recorded', async () => {
  const { plan } = await scopedFixture();
  const captured: any[] = [];
  const sink = (_: string, data: any) => captured.push(data);
  const confirmation = { ordinaryQuestion: 'rule_0_outcome', confirmationQuestion: 'rule_0_confirmation',
    trigger: 'NOT_APPLICABLE' as const, factsReference: 'a'.repeat(64) };
  const submission = { submissionId: 'confirmation:0', scopeId: 'exemption:0', questionKeys: ['rule_0_confirmation'], confirmation };
  captureScopedSubmission(sink, { ...submission, status: 'attempted', payloadJson: JSON.stringify({ model: 'offline', state: plan.groups[1]!.state,
    questions: { rule_0_confirmation: { type: 'choice', instructions: 'Authored confirmation fixture.', criteria: { NOT_APPLICABLE: 'Verified.', UNKNOWN: 'Uncertain.' } } } }) });
  captureScopedSubmission(sink, { ...submission, status: 'unavailable', reason: 'timeout' });
  assert.deepEqual(captured[0].value.confirmation, confirmation);
  assert.equal(captured[0].value.status, 'attempted');
  assert.equal(captured[1].value.status, 'unavailable');
  assert.equal(captured[1].value.payload, undefined);
  assert.ok(!JSON.stringify(captured).includes('thinkingTrace'));
});

test('capture-off does not construct scoped snapshots or invoke accessors', async () => {
  const { request, plan } = await scopedFixture();
  const questions = Object.defineProperty({}, 'bad', { enumerable: true, get() { throw new Error('must-not-read'); } });
  captureScopedPlan(undefined, request, plan, questions, { provider: 'typesafe', model: 'offline' });
  captureScopedSubmission(undefined, Object.defineProperty({ submissionId: 'off', scopeId: 'off', status: 'attempted' as const, questionKeys: ['bad'] },
    'payloadJson', { get() { throw new Error('must-not-read'); } }));
});

test('truncated and unavailable scoped submission snapshots never reconstruct payloads or imply an attempt', async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet108-loss-'));
  try {
    await recordScopedFixture(root);
    const { records } = await readArchive(root);
    const response = records.find(r => r.stage === 'response')!;
    const omitted = [
      { ...response, data: { inputVersion: 'judge-input-scopes-v1', ...responseSnapshot({ text: 'x'.repeat(1024 * 1024 + 1) }) } },
      { ...response, data: { inputVersion: 'judge-input-scopes-v1', ...responseSnapshot(new Error('private')) } },
    ];
    const only = records.filter(r => r.stage !== 'response');
    assert.ok(omitted.every(validRecord));
    const view = invocationView([...only, ...omitted]);
    assert.equal(view.submissions.length, 2);
    assert.ok(view.submissions.every(s => s.status === 'unavailable' && !('payload' in s)));
    assert.equal(view.requestStatus, 'prepared scopes captured; submission unavailable');
    assert.equal(view.judge.returnedModel, 'scripted-scoped'); // Recorded complete assessment, not reconstructed from omissions.
  } finally { await rm(root, { recursive: true, force: true }); }
});
