import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApusJudge } from '../src/decision/apus.js';
import { createSystemOneJudge } from '../src/decision/system-one.js';
import { JudgeFailure, type Judge } from '../src/decision/contracts.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { APUS_MODEL, scriptedNative } from './apus-scripted.js';
import { answer, policy, sdkAnswers } from './helpers.js';

const request = { policy, cwd: '/project', deadlineMs: 5000,
  action: captureAction({ sessionId: 'transport-contract', callId: 'call', toolName: 'inert-fixture', arguments: { text: 'offline' } }) };
const providers = ['system-one', 'apus-llamacpp'] as const;
type Provider = typeof providers[number];
const judge = (provider: Provider, fetch: typeof globalThis.fetch): Judge => provider === 'system-one'
  ? createSystemOneJudge({ baseUrl: 'https://judge.example', model: 'requested', auth: { type: 'bearer', token: 'synthetic-credential' }, fetch })
  : createApusJudge({ baseUrl: 'http://127.0.0.1:8088', model: APUS_MODEL, fetch });

const nativeContract = { version: 'apus-recording-v2', protocolVersion: 'llamacpp-b11118-choice-v1',
  renderingVersion: 'jev.dynamic.prompt.v2', rendererRevision: '7389d774472c9e29ddc84fffb392951f0f25de74' };

const failures: { name: string; response: () => Response; reason: 'provider-error' | 'invalid-response'; nativeCategory?: string }[] = [
  { name: 'HTTP failure', response: () => new Response('private-transport-error', { status: 503 }), reason: 'provider-error', nativeCategory: 'http' },
  { name: 'advertised body overflow', response: () => new Response('{}', { headers: { 'content-length': '1048577' } }), reason: 'invalid-response', nativeCategory: 'body-limit' },
  { name: 'invalid advertised length', response: () => new Response('{}', { headers: { 'content-length': 'invalid' } }), reason: 'invalid-response', nativeCategory: 'body-limit' },
  { name: 'actual body overflow', response: () => new Response(' '.repeat(1048577)), reason: 'invalid-response', nativeCategory: 'body-limit' },
  { name: 'missing body', response: () => new Response(null), reason: 'invalid-response', nativeCategory: 'body-missing' },
  { name: 'invalid UTF-8', response: () => new Response(Uint8Array.of(0xff)), reason: 'invalid-response', nativeCategory: 'body-json' },
  { name: 'invalid JSON', response: () => new Response('private-transport-error'), reason: 'invalid-response', nativeCategory: 'body-json' },
  { name: 'reader rejection', response: () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
    controller.error(new Error('private-transport-error'));
  } })), reason: 'provider-error' },
];

for (const provider of providers) {
  for (const fixture of failures) test(`${provider} preserves ${fixture.name} categories and terminal recording`, async () => {
    const paths: string[] = [], validations: Record<string, unknown>[] = [];
    const run = judge(provider, async (url, init) => {
      paths.push(new URL(String(url)).pathname);
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      assert.equal(new Headers(init?.headers).get('authorization'), provider === 'system-one' ? 'Bearer synthetic-credential' : null);
      return fixture.response();
    });
    await assert.rejects(run(request, new AbortController().signal, (stage, data) => {
      if (stage === 'validation') validations.push(data);
    }), error => {
      assert.ok(error instanceof JudgeFailure);
      assert.equal(error.reason, fixture.reason);
      assert.equal('category' in error ? error.category : undefined, provider === 'apus-llamacpp' ? fixture.nativeCategory : undefined);
      return true;
    });
    assert.deepEqual(paths, [provider === 'system-one' ? '/v1/systemone' : '/v1/models']);
    assert.deepEqual(validations, [provider === 'system-one'
      ? { valid: false, reason: fixture.reason, ...(fixture.reason === 'invalid-response' ? { validationIssue: 'response-shape' } : {}), request: 'submitted' }
      : { nativeContract, valid: false, reason: fixture.reason,
        ...(fixture.nativeCategory ? { nativeCategory: fixture.nativeCategory } : {}), request: 'submitted' }]);
    assert.doesNotMatch(JSON.stringify(validations), /private-transport-error|synthetic-credential/);
  });

  test(`${provider} network rejection retains its safe failure and one attempted exchange`, async () => {
    const paths: string[] = [], validations: Record<string, unknown>[] = [];
    const run = judge(provider, async url => {
      paths.push(new URL(String(url)).pathname);
      throw new Error('private-transport-error synthetic-credential');
    });
    await assert.rejects(run(request, new AbortController().signal, (stage, data) => {
      if (stage === 'validation') validations.push(data);
    }), error => {
      assert.ok(error instanceof JudgeFailure);
      assert.equal(error.reason, 'provider-error');
      assert.equal('category' in error ? error.category : undefined, undefined);
      return true;
    });
    assert.deepEqual(paths, [provider === 'system-one' ? '/v1/systemone' : '/v1/models']);
    assert.deepEqual(validations, [provider === 'system-one'
      ? { valid: false, reason: 'provider-error', request: 'submitted' }
      : { nativeContract, valid: false, reason: 'provider-error', request: 'submitted' }]);
  });

  test(`${provider} successful exchanges retain assessment and protocol-specific request ordering`, async () => {
    const native = scriptedNative(), paths: string[] = [];
    const run = judge(provider, async (url, init) => {
      paths.push(new URL(String(url)).pathname);
      if (provider === 'apus-llamacpp') return native.fetch(url, init);
      const body = JSON.parse(init!.body as string);
      return Response.json({ model: 'returned', answers: sdkAnswers(answer(policy), 1, body.questions) });
    });
    const result = await decide({ ...request, judge: run });
    assert.equal(result.decision, 'ALLOW');
    assert.equal(result.reason, 'all-rules-pass');
    assert.equal(result.assessment?.model, provider === 'system-one' ? 'returned' : APUS_MODEL);
    assert.deepEqual(result.assessment?.rules.map(rule => rule.outcome.choice), ['PASS', 'PASS']);
    if (provider === 'system-one') assert.deepEqual(paths, ['/v1/systemone', '/v1/systemone', '/v1/systemone']);
    else {
      assert.deepEqual(paths.slice(0, 2), ['/v1/models', '/props']);
      assert.deepEqual(paths.slice(-2), ['/v1/models', '/props']);
      assert.equal(paths.filter(path => path === '/completion').length, 4);
    }
  });

  for (const mode of ['rejected', 'thrown'] as const) test(`${provider} retains ${mode} reader failure identity rules`, async () => {
    const original = new JudgeFailure('cancelled');
    let calls = 0, cancellations = 0, releases = 0;
    const run = judge(provider, async () => {
      calls++;
      return { ok: true, redirected: false, headers: new Headers(), body: { getReader: () => ({
        read: () => { if (mode === 'thrown') throw original; return Promise.reject(original); },
        cancel: async () => { cancellations++; }, releaseLock() { releases++; },
      }) } } as unknown as Response;
    });
    await assert.rejects(run(request, new AbortController().signal), error => {
      assert.ok(error instanceof JudgeFailure);
      const normalized = provider === 'system-one' && mode === 'rejected';
      assert.equal(error.reason, normalized ? 'provider-error' : 'cancelled');
      assert.equal(error === original, !normalized);
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(cancellations, 1);
    assert.equal(releases, provider === 'system-one' ? 1 : 0);
  });

  test(`${provider} retains synchronous reader cleanup failure precedence`, async () => {
    let calls = 0, cancellations = 0, releases = 0;
    const run = judge(provider, async () => {
      calls++;
      return { ok: true, redirected: false, headers: new Headers(), body: { getReader: () => ({
        read: async () => ({ done: true, value: undefined }),
        cancel: () => { cancellations++; throw new Error('private-cleanup-error'); },
        releaseLock() { releases++; },
      }) } } as unknown as Response;
    });
    await assert.rejects(run(request, new AbortController().signal), error => {
      assert.ok(error instanceof JudgeFailure);
      assert.equal(error.reason, provider === 'system-one' ? 'invalid-response' : 'provider-error');
      assert.equal('category' in error ? error.category : undefined, undefined);
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(cancellations, 1);
    assert.equal(releases, provider === 'system-one' ? 1 : 0);
  });
}
