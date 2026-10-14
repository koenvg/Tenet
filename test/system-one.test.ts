import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEventListeners } from 'node:events';
import { readFileSync } from 'node:fs';
import { createSystemOneJudge } from '../src/decision/system-one.js';
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
const hosted = { baseUrl: 'https://api.typesafe.ai', model: 'jev-latest' };
const selected = { ...policy, rules: [...policy.rules, { ...policy.rules[0]!, id: 'second', line: 2, text: 'Never delete files outside the project directory.', enforcement: 'BLOCK' as const }] };
const action = captureAction({ sessionId: 's', callId: 'c', toolName: 'new-tool', arguments: { objects: ['code'], authorization: 'hidden' } });
const base = { policy: selected, action, cwd: '/project' };
function response() {
  const assessment = answer(selected);
  const answers = sdkAnswers(assessment, 0.1);
  return { model: 'jev-returned', answers, usage: { input_tokens: 12, output_tokens: 2 } };
}

for (const outcome of ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED'] as const) {
  test(`canonical answer assembly retains System One ${outcome} decisions and gates`, async () => {
    const assessment = answer(selected, outcome);
    const raw = { model: 'same-scripted-model', answers: sdkAnswers(assessment) };
    const clock = { now: () => 0, schedule: () => () => {} };
    const typesafe = await decide({ ...base, clock,
      judge: createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'offline' }, fetch: async (_url, init) => Response.json(groupResponse(raw, JSON.parse(init!.body as string))) }) });
    const canonical = await decide({ ...base, clock, judge: async request => assembleAssessment(raw, request) });
    assert.deepEqual(canonical, typesafe);
    assert.equal(canonical.requestedModel, null);
  });
}

test('official System One submissions use isolated scope-local definitions for each rule', async () => {
  const bodies: any[] = [];
  const judge = createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'offline-test' }, fetch: async (url, init) => {
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
  const result = await decide({ ...base, judge: createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: '' }, fetch: async () => { throw new Error('must not call'); } }) });
  assert.equal(result.reason, 'missing-credentials');
});

test('HTTP failure has no retries and never records provider body', async () => {
  let calls = 0;
  const result = await decide({ ...base, judge: createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'offline' }, fetch: async () => {
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
    const result = await decide({ ...base, judge: createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'offline' }, fetch: async (_url, init) => {
      const raw = groupResponse(response(), JSON.parse(init!.body as string)); mutate(raw); return Response.json(raw);
    } }) });
    assert.equal(result.reason, 'invalid-response');
  }
  for (const raw of ['not json', {}, { model: 'jev', answers: [] }, { model: 'jev', answers: {} }]) {
    const result = await decide({ ...base, judge: createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'offline' }, fetch: async () => Response.json(raw) }) });
    assert.equal(result.reason, 'invalid-response');
  }
});

test('System One receives cancellation and the overall gate bounds stalled transport', async () => {
  assert.equal(DEFAULTS.deadlineMs, 2500);
  for (const kind of ['cancel', 'timeout']) {
    const controller = new AbortController();
    let transportSignal: AbortSignal | undefined, started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const judge = createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'offline' }, fetch: async (_url, init) => {
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

for (const selection of [
  { baseUrl: 'https://judge.example', model: 'hosted-alias', auth: { type: 'bearer', token: 'selected-secret' } },
  { baseUrl: 'http://127.0.0.1:18091', model: 'kev-latest', auth: { type: 'none' } },
  { baseUrl: 'http://[::1]:18091', model: 'local-bearer', auth: { type: 'bearer', token: 'local-secret' } },
] as const) test(`${selection.model} uses explicit destination, model and authentication for three scoped submissions`, async () => {
  const prior = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = 'ambient-must-not-be-used';
  const bodies: any[] = [], records: any[] = [];
  try {
    const judge = createSystemOneJudge({ ...selection, fetch: async (url, init) => {
      assert.equal(url, selection.baseUrl + '/v1/systemone');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), selection.auth.type === 'bearer' ? `Bearer ${selection.auth.token}` : null);
      assert.equal(headers.get('content-type'), 'application/json');
      const body = JSON.parse(init!.body as string); bodies.push(body);
      return Response.json({ model: 'returned-alias', answers: sdkAnswers(answer(policy), 1, body.questions) });
    } });
    const result = await decide({ ...base, policy, judge, recording: (stage, data) => records.push({ stage, data }) });
    assert.equal(result.decision, 'ALLOW');
    assert.equal(result.assessment?.model, 'returned-alias');
    assert.equal(bodies.length, 3);
    assert.ok(bodies.every(body => body.model === selection.model));
    assert.deepEqual(Object.keys(bodies[0].state), ['rule', 'thinkingTrace', 'previousToolCall', 'proposedToolCall']);
    const request = records.find(record => record.stage === 'request').data;
    assert.equal(request.questionVersion, 'policy-rules-v9-scoped');
    assert.equal(request.inputVersion, 'judge-input-scopes-v1');
    assert.doesNotMatch(JSON.stringify({ result, records, bodies }), /ambient-must-not-be-used|selected-secret|local-secret/);
  } finally {
    if (prior === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = prior;
  }
});

for (const kind of [301, 302, 307, 308, 401, 429, 503, 'network', 'redirected'] as const)
  test(`transport ${kind} fails once without error-body capture or another destination`, async () => {
    let calls = 0, bodyReads = 0;
    const records: any[] = [];
    const result = await decide({ ...base, policy, recording: (stage, data) => records.push({ stage, data }),
      judge: createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'credential-sentinel' }, fetch: async (_url, init) => {
        calls++; assert.equal(init?.redirect, 'error');
        if (kind === 'network') throw new Error('credential-sentinel provider-private-error');
        return { ok: kind === 'redirected', redirected: kind === 'redirected', status: kind === 'redirected' ? 200 : kind,
          body: { cancel: async () => {}, getReader: () => { bodyReads++; throw new Error('provider-private-error'); } } } as unknown as Response;
      } }) });
    assert.equal(calls, 1); assert.equal(bodyReads, 0);
    assert.equal(result.reason, 'provider-error'); assert.equal(result.assessment, null);
    assert.doesNotMatch(JSON.stringify({ result, records }), /credential-sentinel|provider-private-error/);
  });

for (const token of [undefined, '', ' ', 'bad key', 'bad\tkey', 'bad\nkey', 'kéy', 'key\x7f'])
  test(`invalid selected credential ${JSON.stringify(token)} makes zero requests`, async () => {
    let calls = 0;
    const result = await decide({ ...base, policy,
      judge: createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token }, fetch: async () => { calls++; throw new Error('unexpected'); } }) });
    assert.equal(result.reason, 'missing-credentials'); assert.equal(calls, 0); assert.equal(result.assessment, null);
  });

for (const [name, mutate, issue] of [
  ['four-decimal sum', (raw: any) => { raw.answers.rule_0_outcome.probabilities = { PASS: 0.9, APPROVAL_REQUIRED: 0.025, FAIL: 0.025, UNKNOWN: 0.025, NOT_APPLICABLE: 0.0249 }; }, 'unit-sum'],
  ['missing label', (raw: any) => { delete raw.answers.rule_0_outcome.probabilities.NOT_APPLICABLE; }, 'labels'],
  ['extra label', (raw: any) => { raw.answers.rule_0_outcome.probabilities.EXTRA = 0; }, 'labels'],
  ['unknown choice', (raw: any) => { raw.answers.rule_0_outcome.choice = 'EXTRA'; }, 'labels'],
  ['negative probability', (raw: any) => { raw.answers.rule_0_outcome.probabilities.PASS = -1; }, 'score-range'],
  ['invalid confidence', (raw: any) => { raw.answers.rule_0_outcome.confidence = null; }, 'score-range'],
  ['non-max choice', (raw: any) => { raw.answers.rule_0_outcome.choice = 'FAIL'; }, 'selected-choice'],
  ['numeric returned model', (raw: any) => { raw.model = 42; }, 'response-shape'],
  ['control returned model', (raw: any) => { raw.model = 'bad\x1bmodel'; }, 'response-shape'],
  ['long returned model', (raw: any) => { raw.model = 'a'.repeat(257); }, 'response-shape'],
] as const) for (const baseUrl of ['https://judge.example', 'http://127.0.0.1:18091'])
  test(`${baseUrl} rejects ${name} without later submissions or a passing partial assessment`, async () => {
    let calls = 0;
    const result = await decide({ ...base, policy,
      judge: createSystemOneJudge({ baseUrl, model: 'requested-alias', auth: { type: 'bearer', token: 'selected-credential' }, fetch: async (_url, init) => {
        calls++;
        const raw = { model: 'returned-alias', answers: sdkAnswers(answer(policy), 1, JSON.parse(init!.body as string).questions) };
        mutate(raw); return Response.json(raw);
      } }) });
    assert.equal(result.reason, 'invalid-response'); assert.equal(result.validationIssue, issue);
    assert.equal(result.assessment, null); assert.equal(calls, 1);
  });

const directRequest = () => ({ ...base, policy, deadlineMs: 5000 });
const expectFailure = (reason: string) => (error: any) => { assert.equal(error.reason, reason); assert.equal(error.message, reason); return true; };

for (const extra of [0, 1]) test(`serialized request at 8 MiB plus ${extra} bytes has the exact transport boundary`, async () => {
  const source = directRequest(), plan = prepareJudgeScopes(source)!;
  const group = { ...plan.groups[0]!, state: { ...plan.groups[0]!.state, rule: '' } };
  const questions = buildQuestions(policy);
  const selectedQuestions = Object.fromEntries(group.questionKeys.map(key => [key, questions[key]]));
  const overhead = Buffer.byteLength(JSON.stringify({ model: hosted.model, state: group.state, questions: selectedQuestions }));
  const paddingBytes = 8 * 1024 * 1024 + extra - overhead;
  const paddedGroup = { ...group, state: { ...group.state, rule: 'é'.repeat(Math.floor(paddingBytes / 2)) + 'a'.repeat(paddingBytes % 2) } };
  let calls = 0;
  const judge = createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'transport-only-key' }, fetch: async (_url, init) => {
    calls++;
    if (calls === 1) assert.equal(Buffer.byteLength(init!.body as string), 8 * 1024 * 1024);
    const body = JSON.parse(init!.body as string);
    return Response.json({ model: 'returned-alias', answers: sdkAnswers(answer(policy), 1, body.questions) });
  } });
  const pending = judge({ ...source, judgeScopes: { ...plan, groups: [paddedGroup, ...plan.groups.slice(1)] } }, new AbortController().signal);
  if (extra) { await assert.rejects(pending, expectFailure('provider-error')); assert.equal(calls, 0); }
  else { const result: any = await pending; assert.equal(result.model, 'returned-alias'); assert.equal(calls, 3); }
});

for (const length of [null, '0', '1048576', '1048577', 'invalid']) for (const extra of [0, 1])
  test(`actual response at 1 MiB plus ${extra} bytes with Content-Length ${length} stays byte bounded`, async () => {
    let calls = 0, cancellations = 0;
    const judge = createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'transport-only-key' }, fetch: async (_url, init) => {
      calls++;
      const body = JSON.parse(init!.body as string);
      const raw = { model: 'returned-alias', answers: sdkAnswers(answer(policy), 1, body.questions), padding: '' };
      const paddingBytes = 1024 * 1024 + extra - Buffer.byteLength(JSON.stringify(raw));
      raw.padding = 'é'.repeat(Math.floor(paddingBytes / 2)) + 'a'.repeat(paddingBytes % 2);
      const bytes = Buffer.from(JSON.stringify(raw));
      assert.equal(bytes.length, 1024 * 1024 + extra);
      const chunks = [bytes.subarray(0, 123), bytes.subarray(123)];
      let index = 0;
      const reader = { read: async () => index < chunks.length ? { done: false, value: chunks[index++]! } : { done: true, value: undefined },
        cancel: async () => { cancellations++; }, releaseLock() {} };
      return { ok: true, redirected: false, headers: new Headers(length === null ? {} : { 'content-length': length }),
        body: { getReader: () => reader, cancel: async () => { cancellations++; } } } as unknown as Response;
    } });
    const pending = judge(directRequest(), new AbortController().signal);
    const rejected = extra === 1 || length === '1048577' || length === 'invalid';
    if (rejected) { await assert.rejects(pending, expectFailure('invalid-response')); assert.equal(calls, 1); assert.equal(cancellations, 1); }
    else { const result: any = await pending; assert.equal(result.model, 'returned-alias'); assert.equal(calls, 3); assert.equal(cancellations, 3); }
  });

test('cancellation between scheduling and invoking fetch submits no request', async () => {
  const controller = new AbortController(); let calls = 0;
  const records: any[] = [];
  const judge = createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'transport-only-key' }, fetch: async () => {
    calls++; return Response.json({});
  } });
  const pending = judge(directRequest(), controller.signal, (stage, data) => records.push({ stage, data }));
  queueMicrotask(() => controller.abort());
  await assert.rejects(pending, expectFailure('cancelled'));
  await new Promise<void>(resolve => queueMicrotask(resolve));
  assert.equal(calls, 0);
  assert.equal(records.find(record => record.stage === 'validation').data.request, 'not-submitted');
});

for (const [name, make, reason] of [
  ['invalid UTF-8', () => new Response(new Uint8Array([0xc3, 0x28])), 'invalid-response'],
  ['invalid JSON', () => new Response('{"model":'), 'invalid-response'],
  ['missing body', () => new Response(null), 'invalid-response'],
  ['reader failure', () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('private-reader-error')); } })), 'provider-error'],
] as const) test(`${name} has a fixed category and prevents later submissions`, async () => {
  let calls = 0; const records: any[] = [];
  const judge = createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'transport-only-key' }, fetch: async () => { calls++; return make(); } });
  await assert.rejects(judge(directRequest(), new AbortController().signal, (stage, data) => records.push({ stage, data })), expectFailure(reason));
  assert.equal(calls, 1); assert.doesNotMatch(JSON.stringify(records), /private-reader-error/);
  assert.ok(!records.some(record => record.stage === 'validation' && record.data.valid));
});

for (const token of ['credential-echo-sentinel', 'quoted-"\\-credential']) test('successful prose/key credential echoes are removed before bounded capture, without score changes', async () => {
  const records: any[] = [];
  const raw = { model: 'returned-alias', answers: sdkAnswers(answer(policy)), prose: `prefix ${token} suffix`,
    nested: [{ [token]: 'untrusted key', notes: `prefix ${token} suffix` }] };
  const result = await decide({ ...base, policy, recording: (stage, data) => records.push({ stage, data }),
    judge: createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token }, fetch: async (_url, init) =>
      Response.json(groupResponse(raw, JSON.parse(init!.body as string))) }) });
  assert.equal(result.decision, 'ALLOW');
  assert.deepEqual(result.assessment, assembleAssessment(raw, directRequest()));
  assert.ok(records.some(record => record.stage === 'response' && record.data.value?.prose === '[redacted]'));
  assert.ok(!JSON.stringify({ result, records }).includes(JSON.stringify(token).slice(1, -1)));
});

for (const captureEnabled of [false, true]) test(`credential-bearing returned identity is rejected with capture ${captureEnabled}`, async () => {
  const token = 'credential-model-sentinel', records: any[] = []; let calls = 0;
  const result = await decide({ ...base, policy, recording: captureEnabled ? (stage, data) => records.push({ stage, data }) : undefined,
    judge: createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token }, fetch: async (_url, init) => {
      calls++; const body = JSON.parse(init!.body as string);
      return Response.json({ model: `returned-${token}`, answers: sdkAnswers(answer(policy), 1, body.questions) });
    } }) });
  assert.equal(result.reason, 'invalid-response'); assert.equal(result.assessment, null); assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify({ result, records }), /credential-model-sentinel/);
});

test('canonical label collisions with a credential fail instead of rewriting scores', async () => {
  const records: any[] = [];
  const result = await decide({ ...base, policy, recording: (stage, data) => records.push({ stage, data }),
    judge: createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'PASS' }, fetch: async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      return Response.json({ model: 'returned-alias', answers: sdkAnswers(answer(policy), 1, body.questions) });
    } }) });
  assert.equal(result.reason, 'invalid-response'); assert.equal(result.assessment, null);
  assert.doesNotMatch(JSON.stringify(records), /PASS/);
});

for (const boundary of ['fetch', 'body'] as const) for (const kind of ['cancelled', 'timeout'] as const)
  test(`noncooperative ${boundary} ends on ${kind}, discards late work and removes listeners`, async () => {
    const controller = new AbortController(); let calls = 0, cancellations = 0;
    let started!: () => void, release!: (value: any) => void, transportSignal!: AbortSignal;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const held = new Promise<any>(resolve => { release = resolve; });
    const records: any[] = [];
    const response = { ok: true, redirected: false, headers: new Headers(), body: {
      cancel: async () => { cancellations++; }, getReader: () => ({
        read: () => { started(); return held; }, cancel: () => { cancellations++; return new Promise<void>(() => {}); }, releaseLock() {},
      }),
    } } as unknown as Response;
    const judge = createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'transport-only-key' }, fetch: async (_url, init) => {
      calls++; transportSignal = init!.signal!;
      if (boundary === 'fetch') { started(); return held; }
      return response;
    } });
    const pending = judge({ ...directRequest(), deadlineMs: kind === 'timeout' ? 25 : 5000 }, controller.signal,
      (stage, data) => records.push({ stage, data }));
    await ready; if (kind === 'cancelled') controller.abort();
    await assert.rejects(pending, expectFailure(kind));
    assert.equal(transportSignal.aborted, true);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    assert.equal(getEventListeners(transportSignal, 'abort').length, 0);
    const count = records.length;
    release(boundary === 'fetch' ? response : { done: true, value: undefined });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(calls, 1); assert.equal(records.length, count); assert.equal(cancellations, 1);
  });

test('successful assessment closes its timer and parent/transport listeners', async () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Set<ReturnType<typeof setTimeout>>(), signals: AbortSignal[] = [];
  const controller = new AbortController();
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    const timer = originalSet(...args); timers.add(timer); return timer;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((timer: ReturnType<typeof setTimeout>) => { timers.delete(timer); originalClear(timer); }) as typeof clearTimeout;
  try {
    const judge = createSystemOneJudge({ ...hosted, auth: { type: 'bearer', token: 'transport-only-key' }, fetch: async (_url, init) => {
      signals.push(init!.signal!); const body = JSON.parse(init!.body as string);
      return Response.json({ model: 'returned-alias', answers: sdkAnswers(answer(policy), 1, body.questions) });
    } });
    const result: any = await judge(directRequest(), controller.signal);
    assert.equal(result.model, 'returned-alias'); assert.equal(signals.length, 3);
    assert.ok(signals.every(signal => signal === signals[0]));
    assert.equal(timers.size, 0); assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    assert.equal(getEventListeners(signals[0]!, 'abort').length, 0);
  } finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
});

for (const baseUrl of ['https://judge.example\n', 'https://judge.example ', 'http://localhost:18091', 'http://127.1:18091',
  'http://2130706433:18091', 'http://127.0.0.1', 'http://127.0.0.1:0', 'http://127.0.0.1:65536', 'http://10.0.0.1:18091',
  'https://user:password@judge.example', 'https://judge.example?', 'https://judge.example#', 'https://judge.example/v1',
  'https://judge.example/a/..', 'https://judge.example\\path', 'https://%6audge.example', 'https://jüdge.example'])
  test('unsafe raw transport destinations fail locally without disclosing the supplied URL', async () => {
    let calls = 0; const records: any[] = [];
    const result = await decide({ ...base, policy, recording: (stage, data) => records.push({ stage, data }),
      judge: createSystemOneJudge({ baseUrl, model: 'requested-alias', auth: { type: 'bearer', token: 'transport-only-key' }, fetch: async () => { calls++; throw new Error('unexpected'); } }) });
    assert.equal(result.reason, 'configuration'); assert.equal(calls, 0); assert.equal(result.assessment, null);
    assert.ok(!JSON.stringify({ result, records }).includes(JSON.stringify(baseUrl).slice(1, -1)));
  });

test('anonymous hosted authentication is rejected and selected options remain immutable', async () => {
  let calls = 0;
  const denied = await decide({ ...base, policy, judge: createSystemOneJudge({ ...hosted, auth: { type: 'none' }, fetch: async () => { calls++; throw new Error('unexpected'); } }) });
  assert.equal(denied.reason, 'configuration'); assert.equal(calls, 0);
  const options = { baseUrl: 'https://JUDGE.example:443/', model: 'requested-alias', auth: { type: 'bearer' as const, token: 'selected-token' },
    fetch: async (url: any, init: any) => {
      assert.equal(url, 'https://judge.example/v1/systemone');
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer selected-token');
      const body = JSON.parse(init.body); assert.equal(body.model, 'requested-alias');
      return Response.json({ model: 'returned-alias', answers: sdkAnswers(answer(policy), 1, body.questions) });
    } };
  const judge = createSystemOneJudge(options);
  options.baseUrl = 'https://different.example'; options.model = 'different-model'; options.auth.token = 'different-token';
  const result: any = await judge(directRequest(), new AbortController().signal);
  assert.equal(result.model, 'returned-alias');
});

const documentedScores = [...readFileSync(new URL('../docs/judge.md', import.meta.url), 'utf8')
  .matchAll(/\| `(0\.[0-9,. ]+)` \| `([01]\.[0-9]+)` \| (Accepted|Rejected) \|/g)];
assert.equal(documentedScores.length, 3);
for (const selection of [hosted, { baseUrl: 'http://127.0.0.1:18091', model: 'kev-latest' }]) for (const row of documentedScores)
  test(`${selection.model} applies unchanged score validation to documented ${row[2]} distribution`, async () => {
    const scores = row[1]!.split(',').map(Number), keys = ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED', 'NOT_APPLICABLE'];
    assert.equal(scores.length, keys.length);
    assert.ok(Math.abs(scores.reduce((sum, value) => sum + value, 0) - Number(row[2])) < 1e-10);
    const distribution = Object.fromEntries(keys.map((key, index) => [key, scores[index]!]));
    const records: any[] = []; let calls = 0;
    const result = await decide({ ...base, policy, recording: (stage, data) => records.push({ stage, data }),
      judge: createSystemOneJudge({ ...selection, auth: selection === hosted ? { type: 'bearer', token: 'transport-only-key' } : { type: 'none' }, fetch: async (_url, init) => {
        calls++; const body = JSON.parse(init!.body as string);
        const raw = { model: 'returned-alias', answers: sdkAnswers(answer(policy), 1, body.questions) };
        if (raw.answers.rule_0_outcome) raw.answers.rule_0_outcome.probabilities = distribution;
        return Response.json(raw);
      } }) });
    const recorded = records.find(record => record.stage === 'response' && record.data.value?.answers?.rule_0_outcome);
    assert.deepEqual(recorded?.data.value?.answers?.rule_0_outcome?.probabilities, distribution, JSON.stringify(recorded));
    if (row[3] === 'Accepted') { assert.equal(result.decision, 'ALLOW'); assert.ok(result.assessment); assert.equal(calls, 3); }
    else { assert.equal(result.reason, 'invalid-response'); assert.equal(result.assessment, null); assert.equal(calls, 1); }
  });
