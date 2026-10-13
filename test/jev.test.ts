import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJevJudge } from '../src/decision/jev.js';
import { buildQuestions } from '../src/decision/questions.js';
import { decide, DEFAULTS } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import { answer, policy, sdkAnswers } from './helpers.js';
import { Observations } from '../src/decision/trajectory.js';
import { assembleAssessment } from '../src/decision/assessment-answers.js';

import { prepareJudgeScopes } from '../src/decision/judge-evidence.js';

function groupResponse(raw: { model: string; answers: Record<string, any> }, body: any) {
  return { ...raw, answers: Object.fromEntries(Object.keys(body.questions).filter(key => Object.hasOwn(raw.answers, key)).map(key => [key, raw.answers[key]])) };
}
const selected = { ...policy, rules: [...policy.rules, { ...policy.rules[0]!, id: 'second', line: 2, text: 'Never delete files outside the project directory.', enforcement: 'BLOCK' as const }] };
const action = captureAction({ sessionId: 's', callId: 'c', toolName: 'new-tool', arguments: { objects: ['code'], authorization: 'hidden' } });
const base = { policy: selected, action, cwd: '/project' };
function response() {
  const assessment = answer(selected);
  const answers = sdkAnswers(assessment, 0.1);
  return { model: 'jev-returned', answers, usage: { input_tokens: 12, output_tokens: 2 } };
}

for (const outcome of ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED'] as const) {
  test(`canonical answer assembly retains TypeSafe ${outcome} decisions and gates`, async () => {
    const assessment = answer(selected, outcome);
    const raw = { model: 'same-scripted-model', answers: sdkAnswers(assessment) };
    const clock = { now: () => 0, schedule: () => () => {} };
    const typesafe = await decide({ ...base, clock,
      judge: createJevJudge({ apiKey: 'offline', fetch: async (_url, init) => Response.json(groupResponse(raw, JSON.parse(init!.body as string))) }) });
    const canonical = await decide({ ...base, clock, judge: async request => assembleAssessment(raw, request) });
    assert.deepEqual(canonical, typesafe);
    assert.equal(canonical.requestedModel, null);
  });
}

test('official SDK submissions use isolated scope-local definitions for each rule', async () => {
  const bodies: any[] = [];
  const judge = createJevJudge({ apiKey: 'offline-test', fetch: async (url, init) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone'); assert.ok(init?.signal);
    const body = JSON.parse(init!.body as string); bodies.push(body);
    return Response.json(groupResponse(response(), body));
  } });
  const history = new Observations('s');
  history.add('pi-tool-result', 'earlier', 'unfamiliar', { arbitrary: 'identifier 7 uploads source' });
  const trajectory = history.snapshot();
  const result = await decide({ ...base, trajectory, judge });
  const plan = prepareJudgeScopes({ ...base, trajectory, deadlineMs: 5000 })!;
  const questions = buildQuestions(selected);
  assert.deepEqual(bodies, plan.groups.map(g => ({ model: 'jev-latest', state: g.state,
    questions: Object.fromEntries(g.questionKeys.map(k => [k, questions[k]])) })));
  assert.equal(bodies.length, 5); assert.equal(result.decision, 'ALLOW');
  assert.equal(result.assessment?.model, 'jev-returned');
  assert.deepEqual(result.assessment?.rules.map(r => r.ruleId), [...selected.rules.map(r => r.id), INTEGRITY_ID]);
  for (const question of Object.values(questions) as any[]) {
    assert.equal(question.type, 'choice');
    assert.match(question.instructions, /state.rule/);
    assert.doesNotMatch(question.instructions, /Git|publication|filesystem|shell|uploads|database|email|state.trajectory|tenetHistory/i);
  }
});

test('question instructions do not branch on domain, rule wording or rule order', () => {
  const questions = buildQuestions(selected);
  const rewritten = { ...selected, rules: selected.rules.map((rule, i) => ({ ...rule, text: i === 0 ? 'Only frobnicate amber widgets.' : 'Never contact external parties.' })) };
  assert.deepEqual(buildQuestions(rewritten), questions);
  assert.deepEqual(buildQuestions({ ...selected, rules: [...selected.rules].reverse() }), questions);
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

test('complete SDK answer set, types and probabilities are validated per submitted group', async () => {
  const mutations: ((raw: any) => void)[] = [
    raw => { raw.model = ''; },
    raw => { delete raw.answers.rule_0_outcome; },
    raw => { raw.answers.extra = raw.answers.rule_0_outcome; },
    raw => { raw.answers.rule_0_outcome.confidence = 5; },
    raw => { raw.answers.rule_0_outcome.type = 'noul'; },
    raw => { raw.answers.rule_0_outcome.probabilities.PASS = 0; },
    raw => { raw.answers.rule_0_evidence.probabilities.INSUFFICIENT = 4; },
  ];
  for (const mutate of mutations) {
    const result = await decide({ ...base, judge: createJevJudge({ apiKey: 'offline', fetch: async (_url, init) => {
      const raw = groupResponse(response(), JSON.parse(init!.body as string)); mutate(raw); return Response.json(raw);
    } }) });
    assert.equal(result.reason, 'invalid-response');
  }
  for (const raw of ['not json', {}, { model: 'jev', answers: [] }, { model: 'jev', answers: {} }]) {
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
