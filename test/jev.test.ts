import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJevJudge } from '../src/decision/jev.js';
import { buildQuestions } from '../src/decision/questions.js';
import { decide, DEFAULTS } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { INTEGRITY_ID, INTEGRITY_TEXT } from '../src/decision/policy.js';
import { answer, policy } from './helpers.js';
import { Observations } from '../src/decision/trajectory.js';

const selected = { ...policy, rules: [...policy.rules, { id: 'second', line: 2, text: 'Never delete files outside the project directory.', enforcement: 'BLOCK' as const }] };
const action = captureAction({ sessionId: 's', callId: 'c', toolName: 'new-tool', arguments: { objects: ['code'], authorization: 'hidden' } });
const base = { policy: selected, action, cwd: '/project' };
function response() {
  const assessment = answer(selected);
  const answers: Record<string, any> = {};
  assessment.rules.forEach((r, i) => {
    answers[`rule_${i}_outcome`] = { type: 'choice', ...r.outcome, confidence: 0.1 };
    answers[`rule_${i}_evidence`] = { type: 'choice', ...r.evidence, confidence: 0.1 };
  });
  return { model: 'jev-returned', answers, usage: { input_tokens: 12, output_tokens: 2 } };
}

test('one official SDK request assesses every rule with generic evidence and trusted context', async () => {
  let calls = 0, capturedUrl: string | undefined, capturedInit: RequestInit | undefined;
  const judge = createJevJudge({ apiKey: 'offline-test', fetch: async (url, init) => {
    calls++; capturedUrl = url; capturedInit = init; return Response.json(response());
  } });
  const history = new Observations('s');
  history.add('pi-tool-result', 'earlier', 'unfamiliar', { arbitrary: 'identifier 7 uploads source' });
  const trajectory = history.snapshot();
  const result = await decide({ ...base, trajectory, judge });
  assert.equal(capturedUrl, 'https://api.typesafe.ai/v1/systemone'); assert.ok(capturedInit?.signal);
  const body = JSON.parse(capturedInit!.body as string);
  assert.deepEqual(body.questions, buildQuestions(selected));
  const questionText = JSON.stringify(body.questions);
  assert.ok(questionText.includes('creating a Git commit'));
  assert.ok(questionText.includes('reading, listing, editing or staging'));
  assert.ok(questionText.includes('edit followed by git commit'));
  assert.equal(Object.keys(body.questions).length, 6);
  assert.equal(body.model, 'jev-latest'); assert.deepEqual(body.state.action, action);
  assert.deepEqual(body.state.trajectory, trajectory);
  assert.deepEqual(body.state.policy.rules, selected.rules.map(({ id, line, text }) => ({ id, line, text })));
  assert.ok(!JSON.stringify(body.state.policy).includes('enforcement'));
  assert.equal(body.state.context.cwd, '/project'); assert.equal(body.state.policy.target, '/policy');
  assert.equal(body.state.integrity.id, INTEGRITY_ID); assert.equal(body.state.integrity.text, INTEGRITY_TEXT);
  assert.ok(!JSON.stringify(body.state).includes('hidden'));
  assert.equal(calls, 1); assert.equal(result.decision, 'ALLOW'); assert.equal(result.assessment?.model, 'jev-returned');
  assert.deepEqual(result.assessment?.rules.map(r => r.ruleId), [...selected.rules.map(r => r.id), INTEGRITY_ID]);
});

test('question contract covers exceptions, evidence limits, untrusted claims and early/private uploads', () => {
  const text = JSON.stringify(buildQuestions(selected));
  for (const fragment of ['complete rule', 'without approval', 'untrusted', 'history', 'private', 'Git objects', 'reference', 'redact', 'whole invocation', 'UNKNOWN']) assert.ok(text.includes(fragment), fragment);
});

test('missing credentials blocks without constructing a request', async () => {
  const result = await decide({ ...base, judge: createJevJudge({ apiKey: '', fetch: async () => { throw new Error('must not call'); } }) });
  assert.equal(result.reason, 'missing-credentials');
});

test('HTTP failure has no retries and never records provider body', async () => {
  let calls = 0;
  const result = await decide({ ...base, judge: createJevJudge({ apiKey: 'offline', fetch: async () => {
    calls++; return new Response('credential-bearing-provider-error', { status: 503 });
  } }) });
  assert.equal(calls, 1); assert.equal(result.reason, 'provider-error'); assert.ok(!JSON.stringify(result).includes('credential-bearing'));
});

test('complete SDK answer set, types and probabilities are validated', async () => {
  const mutations: ((raw: ReturnType<typeof response>) => void)[] = [
    raw => { raw.model = ''; },
    raw => { delete raw.answers.rule_0_outcome; },
    raw => { raw.answers.extra = raw.answers.rule_0_outcome; },
    raw => { raw.answers.rule_0_outcome.confidence = 5; },
    raw => { raw.answers.rule_0_outcome.type = 'noul'; },
    raw => { raw.answers.rule_0_outcome.probabilities.PASS = 0; },
    raw => { raw.answers.rule_0_evidence.probabilities.INSUFFICIENT = 4; },
    raw => { raw.answers.rule_2_outcome = { type: 'choice', confidence: 1, choice: 'APPROVAL_REQUIRED', probabilities: { PASS: 0, APPROVAL_REQUIRED: 1, FAIL: 0, UNKNOWN: 0 } }; },
  ];
  const raws: unknown[] = ['not json', {}, { model: 'jev', answers: [] }, { model: 'jev', answers: {} }];
  for (const mutate of mutations) { const raw = response(); mutate(raw); raws.push(raw); }
  for (const raw of raws) {
    const result = await decide({ ...base, judge: createJevJudge({ apiKey: 'offline', fetch: async () => Response.json(raw) }) });
    assert.equal(result.reason, 'invalid-response');
  }
});

test('SDK receives cancellation and the overall gate bounds stalled transport', async () => {
  assert.equal(DEFAULTS.deadlineMs, 2500);
  for (const kind of ['cancel', 'timeout']) {
    const controller = new AbortController();
    let transportSignal: AbortSignal | undefined, started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const judge = createJevJudge({ apiKey: 'offline', fetch: async (_url, init) => {
      transportSignal = init?.signal ?? undefined; started();
      return new Promise((_resolve, reject) => { transportSignal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); });
    } });
    const pending = decide({ ...base, judge, signal: controller.signal, config: { deadlineMs: 30 } });
    await ready; if (kind === 'cancel') controller.abort();
    const result = await pending;
    assert.equal(result.decision, 'BLOCK'); assert.equal(result.reason, kind === 'cancel' ? 'cancelled' : 'timeout');
    assert.equal(transportSignal?.aborted, true);
  }
});
