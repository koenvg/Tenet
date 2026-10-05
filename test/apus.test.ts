import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApusJudge } from '../src/decision/apus.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { judgeState, boundEvidence } from '../src/decision/judge-evidence.js';
import { buildQuestions } from '../src/decision/questions.js';
import { QUESTION_VERSION } from '../src/decision/assessment-contract.js';
import { APUS_MODEL, scriptedNative, type NativeCall } from './apus-scripted.js';
import { policy } from './helpers.js';

const request = { policy, action: captureAction({ sessionId: 's', callId: 'c', toolName: 'inert-fixture', arguments: { text: 'literal rm -rf /; 😀' } }), cwd: '/project', deadlineMs: 5000 };
const options = { baseUrl: 'http://127.0.0.1:8088', model: APUS_MODEL };
const run = (fetch: typeof globalThis.fetch) => decide({ ...request, judge: createApusJudge({ ...options, fetch }), judgeIdentity: { provider: 'apus-llamacpp', requestedModel: APUS_MODEL } });

test('complete canonical assessment uses sequential native scoring and deterministic NONE provenance', async () => {
  const fake = scriptedNative(); const records: { stage: string; data: any }[] = [];
  const result = await decide({ ...request, judge: createApusJudge({ ...options, fetch: fake.fetch }), recording: (stage, data) => records.push({ stage, data }) });
  assert.equal(result.decision, 'ALLOW'); assert.equal(result.assessment?.model, APUS_MODEL);
  assert.equal(result.questionVersion, QUESTION_VERSION); assert.equal(result.assessment?.rules.length, 2);
  const scores = fake.calls.filter(c => c.path === '/completion'); assert.equal(scores.length, 4);
  for (const c of fake.calls) {
    assert.equal(c.init.redirect, 'error'); assert.equal(c.init.credentials, 'omit');
    assert.ok(c.init.signal); assert.equal(c.init.signal, fake.calls[0]!.init.signal);
    assert.ok(!JSON.stringify(c.init).includes('TYPESAFE')); assert.ok(!new Headers(c.init.headers).has('authorization'));
    if (c.path === '/tokenize') { assert.equal(c.body.add_special, false); assert.equal(c.body.parse_special, true); }
  }
  for (const c of scores) {
    assert.ok(Array.isArray(c.body.prompt)); assert.equal(c.body.stream, false); assert.equal(c.body.n_predict, 1);
    assert.equal(c.body.n_probs, 1024); assert.equal(c.body.temperature, 0); assert.equal(c.body.cache_prompt, true); assert.equal(c.body.post_sampling_probs, false);
    assert.ok(!('grammar' in c.body)); assert.ok(!('logit_bias' in c.body));
  }
  assert.deepEqual(fake.calls.slice(0, 2).map(c => c.path), ['/v1/models', '/props']);
  assert.deepEqual(fake.calls.slice(-2).map(c => c.path), ['/v1/models', '/props']);
  const captured = records.find(r => r.stage === 'request')!.data;
  assert.deepEqual(captured.payload.questions, buildQuestions(policy));
  assert.deepEqual(captured.payload.state, judgeState(boundEvidence(request)!));
  const deterministic = records.filter(r => r.stage === 'response').map(r => r.data.value).find(v => v?.derivation === 'sole-allowed-facts-selector');
  assert.deepEqual(deterministic.answer, { type: 'choice', choice: 'NONE', probabilities: { NONE: 1 }, confidence: 1 });
  assert.equal(deterministic.modelConfidence, false); assert.equal(deterministic.authenticatedCoverage, false);
});

const invalid: [string, (v: any, c: NativeCall) => void][] = [
  ['missing alias', (v,c) => { if(c.path === '/v1/models') delete v.data[0].id; }],
  ['wrong alias', (v,c) => { if(c.path === '/v1/models') v.data[0].id = 'other'; }],
  ['unloaded model', (v,c) => { if(c.path === '/v1/models') v.data[0].meta = null; }],
  ['props alias mismatch', (v,c) => { if(c.path === '/props') v.model_alias = 'other'; }],
  ['missing props alias', (v,c) => { if(c.path === '/props') delete v.model_alias; }],
  ['missing context', (v,c) => { if(c.path === '/props') delete v.default_generation_settings.n_ctx; }],
  ['overflow', (v,c) => { if(c.path === '/props') v.default_generation_settings.n_ctx = 10; if(c.path === '/v1/models') v.data[0].meta.n_ctx = 10; }],
  ['tokenizer shape', (v,c) => { if(c.path === '/tokenize') v.tokens = ['bad']; }],
  ['label splits', (v,c) => { if(c.path === '/tokenize' && c.body.content === 'A') v.tokens = [32,33]; }],
  ['label boundary changes', (v,c) => { if(c.path === '/tokenize' && c.body.content.endsWith('</think>\n\nA')) v.tokens.splice(-2,2,42); }],
  ['truncated', (v,c) => { if(c.path === '/completion') v.truncated = true; }],
  ['missing truncation flag', (v,c) => { if(c.path === '/completion') delete v.truncated; }],
  ['conflicting response model', (v,c) => { if(c.path === '/completion') v.model = 'other'; }],
  ['multiple positions', (v,c) => { if(c.path === '/completion') v.completion_probabilities.push(v.completion_probabilities[0]); }],
  ['missing candidate', (v,c) => { if(c.path === '/completion') v.completion_probabilities[0].top_logprobs.pop(); }],
  ['duplicate candidate', (v,c) => { if(c.path === '/completion') v.completion_probabilities[0].top_logprobs.push(v.completion_probabilities[0].top_logprobs[0]); }],
  ['candidate wrong token id', (v,c) => { if(c.path === '/completion') v.completion_probabilities[0].top_logprobs[0].id = 999; }],
  ['invalid candidate bytes', (v,c) => { if(c.path === '/completion') v.completion_probabilities[0].top_logprobs[0].bytes = [66]; }],
  ['null score', (v,c) => { if(c.path === '/completion') v.completion_probabilities[0].top_logprobs[0].logprob = null; }],
  ['positive score', (v,c) => { if(c.path === '/completion') v.completion_probabilities[0].top_logprobs[0].logprob = 1; }],
  ['post sampling shape', (v,c) => { if(c.path === '/completion') v.completion_probabilities[0].top_probs = v.completion_probabilities[0].top_logprobs; if(c.path === '/completion') delete v.completion_probabilities[0].top_logprobs; }],
  ['shortened prompt count', (v,c) => { if(c.path === '/completion') v.tokens_evaluated--; }],
  ['empty distribution', (v,c) => { if(c.path === '/completion') v.completion_probabilities[0].top_logprobs = []; }],
  ['zero positions', (v,c) => { if(c.path === '/completion') v.completion_probabilities = []; }],
  ['duplicate noncandidate id', (v,c) => { if(c.path === '/completion') v.completion_probabilities[0].top_logprobs.push({ id: 50, token: 'x', logprob: -20 }, { id: 50, token: 'y', logprob: -20 }); }],
  ['response context conflict', (v,c) => { if(c.path === '/completion') v.generation_settings.n_ctx = 10; }],
  ['masked distribution', (v,c) => { if(c.path === '/completion') v.generation_settings.grammar = 'forced-choice'; }],
  ['changed sampling probabilities', (v,c) => { if(c.path === '/completion') v.generation_settings.post_sampling_probs = true; }],
  ['token vocabulary bound', (v,c) => { if(c.path === '/tokenize') v.tokens[0] = 300000; }],
  ['metadata context disagreement', (v,c) => { if(c.path === '/props') v.default_generation_settings.n_ctx--; }],
  ['output count', (v,c) => { if(c.path === '/completion') v.tokens_predicted = 2; }],
];
for (const [name, mutate] of invalid) test(`native rejects ${name} without partial assessment or retry`, async () => {
  const fake = scriptedNative({ mutate: (v,c) => { mutate(v,c); return v; } });
  const result = await run(fake.fetch); assert.equal(result.reason, 'invalid-response', name); assert.equal(result.assessment, null);
  assert.ok(fake.calls.filter(c => c.path === '/completion').length <= 1);
});

test('identity is checked again before acceptance, not invented on failure', async () => {
  const fake = scriptedNative({ mutate: (v,c,i) => { if(c.path === '/v1/models' && i > 0) v.data[0].id = 'replaced'; return v; } });
  const result = await run(fake.fetch); assert.equal(result.assessment, null); assert.equal(result.reason, 'invalid-response');
  assert.equal(result.requestedModel, APUS_MODEL);
});

test('normalization is stable for extreme finite scores and ignores sampled-token preference', async () => {
  const fake = scriptedNative({ mutate: (v,c) => { if(c.path === '/completion') { for(const row of v.completion_probabilities[0].top_logprobs) row.logprob = row.token === 'A' ? -10000 : -10010; v.content='B'; v.tokens=[33]; v.completion_probabilities[0].id=33; v.completion_probabilities[0].token='B'; v.completion_probabilities[0].bytes=[66]; } return v; } });
  const result = await run(fake.fetch); assert.equal(result.decision, 'ALLOW');
  assert.ok(result.assessment!.rules[0]!.outcome.probabilities.PASS > 0.99);
});

test('HTTP failures, redirects, malformed and oversized bodies expose no sensitive body', async () => {
  for (const response of [new Response('secret-error', { status: 503 }), new Response('secret-error', { status: 302, headers: { location: 'https://remote.invalid' } }), new Response('secret-error'), new Response('x'.repeat(1024*1024+1))]) {
    let calls=0; const result = await run(async () => { calls++; return response; });
    assert.equal(calls,1); assert.equal(result.assessment,null); assert.ok(!JSON.stringify(result).includes('secret-error'));
  }
});

test('abort before start sends no requests', async () => {
  const fake = scriptedNative(); const controller = new AbortController(); controller.abort();
  await assert.rejects(createApusJudge({ ...options, fetch: fake.fetch })(request, controller.signal), /cancelled/);
  assert.equal(fake.calls.length,0);
});

for (const stalled of ['fetch','body'] as const) test(`whole assessment deadline bounds noncooperative ${stalled} and discards late work`, async () => {
  let resolve!: (v: any) => void; let calls=0; const records: unknown[]=[];
  const fetcher: typeof fetch = async () => {
    calls++;
    if(stalled === 'fetch') return new Promise(r => { resolve=r; });
    return { ok: true, redirected: false, headers: new Headers(), body: { getReader: () => ({ read: () => new Promise(r => { resolve = () => r({ done: false, value: new TextEncoder().encode('{}') }); }), cancel: () => new Promise(() => {}) }) } } as unknown as Response;
  };
  const judge=createApusJudge({ ...options, fetch:fetcher });
  await assert.rejects(judge({ ...request, deadlineMs:20 },new AbortController().signal,(stage,data)=>records.push({stage,data})), /timeout/);
  const length=records.length; resolve(stalled === 'fetch' ? Response.json({}) : undefined);
  await new Promise(r=>setTimeout(r,10)); assert.equal(calls,1); assert.equal(records.length,length);
});

test('abort between native requests prevents the next request and complete validation', async () => {
  const controller=new AbortController(); const fake=scriptedNative({mutate:(v,c)=>{if(c.path==='/completion')controller.abort();return v;}});
  await assert.rejects(createApusJudge({...options,fetch:fake.fetch})(request,controller.signal),/cancelled/);
  assert.equal(fake.calls.filter(c=>c.path==='/completion').length,1); assert.equal(fake.calls.at(-1)!.path,'/completion');
});

test('deadline is shared across requests and a partial failure stops scoring', async () => {
  const fake=scriptedNative(); let calls=0;
  const fetcher:typeof fetch=async(url,init)=>{calls++;await new Promise(r=>setTimeout(r,10));return fake.fetch(url,init);};
  await assert.rejects(createApusJudge({...options,fetch:fetcher})({...request,deadlineMs:35},new AbortController().signal),/timeout/);
  assert.ok(calls<6); assert.equal(fake.calls.filter(c=>c.path==='/completion').length,0);
  const partial=scriptedNative({mutate:(v,c)=>c.path==='/completion'?new Response('private-failure',{status:500}):v});
  const result=await run(partial.fetch); assert.equal(result.reason,'provider-error'); assert.equal(result.assessment,null);
  assert.equal(partial.calls.filter(c=>c.path==='/completion').length,1);
});


test('invalid destination is rejected before construction can submit', () => {
  for (const baseUrl of ['http://localhost:8088', 'http://127.0.0.1', 'http://127.0.0.1:8088/path', 'http://127.1:8088', 'http://127.0.0.1:8088?', 'https://127.0.0.1:8088'])
    assert.throws(() => createApusJudge({ ...options, baseUrl, fetch: async () => { throw new Error('never'); } }), /invalid-apus-settings/);
  assert.doesNotThrow(() => createApusJudge({ ...options, baseUrl: 'http://[::1]:8088/' }));
});

for (const phase of ['tokenizer', 'completion', 'final-identity'] as const) test(`shared deadline bounds stalled ${phase} after earlier work`, async () => {
  const fake = scriptedNative(); let stalledSignal: AbortSignal | undefined; let submissions = 0;
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname; submissions++;
    if ((phase === 'tokenizer' && path === '/tokenize') || (phase === 'completion' && path === '/completion')
      || (phase === 'final-identity' && path === '/v1/models' && submissions > 1)) {
      stalledSignal = init!.signal!; return new Promise(() => {});
    }
    return fake.fetch(url, init);
  };
  await assert.rejects(createApusJudge({ ...options, fetch: fetcher })({ ...request, deadlineMs: 80 }, new AbortController().signal), /timeout/);
  assert.equal(stalledSignal?.aborted, true);
  assert.equal(fake.calls.filter(c => c.path === '/completion').length, phase === 'final-identity' ? 4 : 0);
});

test('abort at final identity cannot return a completed assessment', async () => {
  const controller = new AbortController();
  const fake = scriptedNative({ mutate: (v,c,i) => { if (c.path === '/props' && i > 1) controller.abort(); return v; } });
  const records: any[] = [];
  await assert.rejects(createApusJudge({ ...options, fetch: fake.fetch })(request, controller.signal, (stage,data) => records.push({stage,data})), /cancelled/);
  assert.equal(fake.calls.filter(c => c.path === '/completion').length, 4);
  assert.ok(!records.some(r => r.stage === 'validation' && r.data.valid === true));
});

test('context fit uses the full prompt and retains a spare slot at the exact boundary', async () => {
  const preview = scriptedNative(); await run(preview.fetch);
  const max = Math.max(...preview.calls.filter(c => c.path === '/completion').map(c => c.body.prompt.length));
  for (const spare of [1,2]) {
    const fake = scriptedNative({ mutate: (v,c) => { if (c.path === '/v1/models') v.data[0].meta.n_ctx = max + spare;
      if (c.path === '/props') v.default_generation_settings.n_ctx = max + spare; return v; } });
    const result = await run(fake.fetch); assert.equal(result.reason, spare === 2 ? 'all-rules-pass' : 'invalid-response');
  }
});

test('bodies are bounded and malformed metadata never reaches scoring', async () => {
  for (const path of ['/v1/models','/props','/tokenize','/completion']) {
    const fake = scriptedNative({ mutate: (v,c) => c.path === path ? new Response('x'.repeat(1024*1024+1)) : v });
    const result = await run(fake.fetch); assert.equal(result.reason,'invalid-response'); assert.equal(result.assessment,null);
    assert.equal(fake.calls.filter(c => c.path === '/completion').length, path === '/completion' ? 1 : 0);
  }
});
