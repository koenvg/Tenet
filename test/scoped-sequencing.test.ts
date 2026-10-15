import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JudgeRequest } from '../src/decision/contracts.js';
import { createSystemOneJudge } from '../src/decision/system-one.js';
import { createApusJudge } from '../src/decision/apus.js';
import type { RecordingSink } from '../src/recording/contract.js';
import { recordedSubmissions, type ScopedQuestions } from '../src/recording/scoped.js';
import { APUS_MODEL, scriptedNative } from './apus-scripted.js';
import frozen from './fixtures/judge-prompts/v8-read-00.json' with { type: 'json' };

const request = { ...frozen.request, deadlineMs: 5000 } as unknown as JudgeRequest;
const local = { baseUrl: 'http://127.0.0.1:18091', model: 'kev-latest', auth: { type: 'none' } } as const;
const native = { baseUrl: 'http://127.0.0.1:8088', model: APUS_MODEL };
function grouped() {
  const bodies: { questions: ScopedQuestions }[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string) as { questions: ScopedQuestions };
    bodies.push(body);
    return Response.json({ model: 'stable-scripted-model', answers: Object.fromEntries(Object.entries(body.questions).map(([key, q]) => {
      const choice = Object.keys(q.criteria)[0]!;
      return [key, { type: 'choice', choice, confidence: 1,
        probabilities: Object.fromEntries(Object.keys(q.criteria).map(label => [label, label === choice ? 1 : 0])) }];
    })) });
  };
  return { bodies, fetch: fetcher };
}
function capture() {
  const records: { stage: string; data: Record<string, unknown> }[] = [];
  const record: RecordingSink = (stage, data) => { records.push({ stage, data }); };
  return { records, record };
}

test('System One answer diagnostics precede model identity rejection', async () => {
  const fake = grouped(), recording = capture();
  const fetcher: typeof fetch = async (url, init) => {
    const raw = await (await fake.fetch(url, init)).json() as { model: string; answers: Record<string, { confidence: number }> };
    raw.model = 'invalid\nmodel';
    raw.answers.rule_0_outcome!.confidence = 2;
    return Response.json(raw);
  };
  await assert.rejects(createSystemOneJudge({ ...local, fetch: fetcher })(request, new AbortController().signal, recording.record),
    { reason: 'invalid-response', validationIssue: 'score-range' });
  assert.equal(fake.bodies.length, 1);
  assert.deepEqual(recordedSubmissions(recording.records).map(s => ['submissionId' in s ? s.submissionId : null, s.status]),
    [['ordinary:0', 'attempted'], ['ordinary:0', 'unavailable']]);
  assert.deepEqual(recording.records.filter(r => r.stage === 'validation').map(r => [r.data.valid, r.data.validationIssue]),
    [[false, 'score-range']]);
});

test('APUS keeps the completed outcome when ordinary evidence fails and does not advance the scope', async () => {
  let scored = 0;
  const fake = scriptedNative({ mutate(value, call) {
    if (call.path === '/completion' && ++scored === 2) value.truncated = true;
    return value;
  } });
  const recording = capture();
  await assert.rejects(createApusJudge({ ...native, fetch: fake.fetch })(request, new AbortController().signal, recording.record),
    { reason: 'invalid-response', category: 'completion-shape' });
  assert.deepEqual(recordedSubmissions(recording.records).map(s => ['submissionId' in s ? s.submissionId : null, s.status]), [
    ['rule_0_outcome', 'attempted'], ['rule_0_outcome', 'completed'],
    ['rule_0_evidence', 'attempted'], ['rule_0_evidence', 'unavailable'],
  ]);
  assert.deepEqual(fake.calls.filter(c => c.path === '/v1/models' || c.path === '/props').map(c => c.path), ['/v1/models', '/props']);
  assert.deepEqual(recording.records.filter(r => r.stage === 'validation').map(r => [r.data.valid, r.data.nativeCategory]),
    [[false, 'completion-shape']]);
});

test('APUS checks metadata-only identity changes after completed questions and before assessment assembly', async () => {
  let props = 0;
  const fake = scriptedNative({ mutate(value, call) {
    if (call.path === '/props' && ++props === 2) value.model_path = '/offline/changed-weights.gguf';
    return value;
  } });
  const recording = capture();
  await assert.rejects(createApusJudge({ ...native, fetch: fake.fetch })(request, new AbortController().signal, recording.record),
    { reason: 'invalid-response', category: 'backend-changed' });
  assert.deepEqual(recordedSubmissions(recording.records).filter(s => s.status !== 'attempted').map(s => ['submissionId' in s ? s.submissionId : null, s.status]), [
    ['rule_0_outcome', 'completed'], ['rule_0_evidence', 'completed'], ['rule_0_facts', 'unavailable'],
    ['rule_1_outcome', 'completed'], ['rule_1_evidence', 'completed'],
  ]);
  assert.deepEqual(recording.records.filter(r => r.stage === 'validation').map(r => [r.data.valid, r.data.nativeCategory]),
    [[false, 'backend-changed']]);
  assert.deepEqual(fake.calls.slice(-2).map(c => c.path), ['/v1/models', '/props']);
});

for (const provider of ['system-one', 'apus'] as const) test(`${provider} preserves cancellation from successful validation recording`, async () => {
  const controller = new AbortController(), recording = capture();
  const record: RecordingSink = (stage, data) => {
    recording.record(stage, data);
    if (stage === 'validation' && data.valid === true) controller.abort();
  };
  const judge = provider === 'system-one' ? createSystemOneJudge({ ...local, fetch: grouped().fetch })
    : createApusJudge({ ...native, fetch: scriptedNative().fetch });
  const pending = judge(request, controller.signal, record);
  if (provider === 'system-one') {
    await assert.rejects(pending, { reason: 'cancelled' });
    assert.deepEqual(recording.records.filter(r => r.stage === 'validation').map(r => [r.data.valid, r.data.reason]),
      [[true, undefined], [false, 'cancelled']]);
  } else {
    const assessment = await pending as { rules: { ruleId: string; outcome: { choice: string } }[] };
    assert.deepEqual(assessment.rules.map(r => [r.ruleId, r.outcome.choice]), [['project:95cda1080ca009008ae6c799066ec5340cd16027803042e5919e02255d150f03:1', 'PASS'], ['builtin:policy-integrity', 'PASS']]);
    assert.deepEqual(recording.records.filter(r => r.stage === 'validation').map(r => r.data.valid), [true]);
  }
});
