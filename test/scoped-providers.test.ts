import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { JudgeRequest } from '../src/decision/contracts.js';
import { createApusJudge } from '../src/decision/apus.js';
import { createJevJudge } from '../src/decision/jev.js';
import { prepareJudgeScopes, boundEvidence } from '../src/decision/judge-evidence.js';
import { buildQuestions } from '../src/decision/questions.js';
import { assessmentDecision, DEFAULTS } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { currentFactReferences } from '../src/decision/assessment-contract.js';
import { validScopedRequest, recordedSubmissions } from '../src/recording/scoped.js';
import { validNativeCapture } from '../src/recording/native.js';
import { Observations } from '../src/decision/trajectory.js';
import { renderApus, sortedJson } from '../src/decision/apus-renderer.js';
import { APUS_MODEL, scriptedNative, tokenIds } from './apus-scripted.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/judge-prompts/v8-read-00.json', import.meta.url), 'utf8'));
const request: JudgeRequest = { ...baseline.request, deadlineMs: 5000 };
const nativeOptions = { baseUrl: 'http://127.0.0.1:8088', model: APUS_MODEL };
const sink = () => {
  const records: { stage: string; data: any }[] = [];
  return { records, record: (stage: any, data: any) => { records.push({ stage, data }); } };
};
function complete(source = request): JudgeRequest {
  return { ...source, resolvedAction: { status: 'authenticated-complete', redactedFields: 0, limitations: [], facts: { version: 1,
    binding: { host: 'fixture', sessionId: source.action.sessionId, contextId: 'synthetic', invocationId: 'synthetic',
      callId: source.action.callId, toolName: source.action.toolName, argumentDigest: source.action.argumentDigest, cwd: source.cwd },
    integration: { id: 'fixture', version: '1' }, resolverState: 'HOST_FACT_SENTINEL', coverage: 'complete', limitations: [],
    operations: [{ id: 'read-1', semantics: 'file-read', resources: [{ requested: '/synthetic/README.md', resolved: '/synthetic/README.md',
      identity: 'revision-1', relation: 'direct' }], content: [{ role: 'literal', value: 'FACT_CONTENT_SENTINEL' }] }] } } };
}
function choice(criteria: Record<string, string>, winner = Object.keys(criteria)[0]!, score = 1) {
  const keys = Object.keys(criteria);
  return { type: 'choice', choice: winner, confidence: score,
    probabilities: Object.fromEntries(keys.map(k => [k, k === winner ? score : (1 - score) / (keys.length - 1)])) };
}
function sdkScript(select: (key: string, q: any, body: any) => { winner?: string; score?: number } = () => ({})) {
  const bodies: any[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string); bodies.push(body);
    return Response.json({ model: 'stable-scripted-model', answers: Object.fromEntries(Object.entries(body.questions).map(([key, q]: [string, any]) => {
      const { winner, score } = select(key, q, body);
      return [key, choice(q.criteria, winner, score)];
    })) });
  };
  return { bodies, fetch: fetcher };
}
const runJev = (source: JudgeRequest, fetcher: typeof fetch, signal = new AbortController().signal, recording?: ReturnType<typeof sink>['record']) =>
  createJevJudge({ apiKey: 'offline-script-only', fetch: fetcher })(source, signal, recording);

for (const hasTrace of [false, true]) for (const hasPrevious of [false, true]) test(`both actual transports isolate read-${+hasTrace}${+hasPrevious}`, async () => {
  const history = new Observations(request.action.sessionId);
  if (hasPrevious) {
    history.addHistory([{ kind: 'tool-call', callId: 'previous', toolName: 'read', data: { path: '/synthetic/NOTES.md' } },
      { kind: 'tool-result', callId: 'previous', toolName: 'read', data: 'RESULT_SENTINEL' }]);
  }
  const source = { ...request, trajectory: history.snapshot() };
  const plan = prepareJudgeScopes(source, hasTrace ? { thinkingTrace: { status: 'present', text: 'I will read the synthetic README.' } } : {})!;
  const prepared = { ...source, judgeScopes: plan }, questions = buildQuestions(source.policy);
  const sdk = sdkScript(), jevCapture = sink();
  const jev: any = await runJev(prepared, sdk.fetch, undefined, jevCapture.record);
  assert.equal(sdk.bodies.length, 3);
  assert.deepEqual(sdk.bodies, plan.groups.map(g => ({ model: 'jev-latest', state: g.state,
    questions: Object.fromEntries(g.questionKeys.map(k => [k, questions[k]])) })));
  const fake = scriptedNative(), nativeCapture = sink();
  const apus: any = await createApusJudge({ ...nativeOptions, fetch: fake.fetch })(prepared, new AbortController().signal, nativeCapture.record);
  assert.equal(fake.calls.filter(c => c.path === '/completion').length, 4);
  const submitted = recordedSubmissions(nativeCapture.records).filter(s => s.status === 'completed') as any[];
  assert.equal(submitted.length, 4);
  const actualChats = fake.calls.filter(c => c.path === '/tokenize' && c.body.content.endsWith('</think>\n\n')).map(c => c.body.content);
  const expectedChats = submitted.map(s => {
    const q: any = Object.values(s.payload.questions)[0];
    return renderApus({ state: sortedJson(s.payload.state), instructions: q.instructions,
      criteria: Object.entries(q.criteria).map(([id, description]) => ({ id, description: description as string })) }).chat;
  });
  assert.deepEqual(actualChats, expectedChats);
  assert.deepEqual(fake.calls.filter(c => c.path === '/completion').map(c => c.body.prompt), expectedChats.map(tokenIds));
  for (const capture of [jevCapture, nativeCapture]) {
    const d = capture.records.find(r => r.stage === 'request')!.data;
    assert.equal(validScopedRequest(d), true); assert.equal(d.questionVersion, 'policy-rules-v9-scoped');
    assert.equal(d.inputVersion, 'judge-input-scopes-v1'); assert.equal(d.evidenceContext.history, null);
    assert.ok(!JSON.stringify(d).includes('RESULT_SENTINEL'));
  }
  for (const r of nativeCapture.records) assert.equal(validNativeCapture(r.stage, r.data), true);
  assert.deepEqual(assessmentDecision(apus, DEFAULTS, request.policy), assessmentDecision(jev, DEFAULTS, request.policy));
  assert.equal(assessmentDecision(jev, DEFAULTS, request.policy).decision, 'ALLOW');
  // Exact bytes only. Scripted token IDs are not real tokenizer measurements.
  const oldPrompts = Object.values(baseline.questions).filter((q: any) => Object.keys(q.criteria).length > 1).map((q: any) =>
    renderApus({ state: sortedJson(baseline.state), instructions: q.instructions,
      criteria: Object.entries(q.criteria).map(([id, description]) => ({ id, description: description as string })) }).chat);
  assert.ok(expectedChats.reduce((n, c) => n + Buffer.byteLength(c), 0) < oldPrompts.reduce((n, c) => n + Buffer.byteLength(c), 0));
});

test('verified facts never enter ordinary state or protected sibling state in actual submissions', async () => {
  const source = complete(), sdk = sdkScript(), capture = sink();
  await runJev(source, sdk.fetch, undefined, capture.record);
  assert.doesNotMatch(JSON.stringify(sdk.bodies[0]), /HOST_FACT_SENTINEL|FACT_CONTENT_SENTINEL|resolvedAction|candidates/);
  assert.match(JSON.stringify(sdk.bodies[1]), /HOST_FACT_SENTINEL|FACT_CONTENT_SENTINEL/);
  assert.doesNotMatch(JSON.stringify(sdk.bodies[2]), /HOST_FACT_SENTINEL|FACT_CONTENT_SENTINEL|thinkingTrace|previousToolCall/);
  const fake = scriptedNative(), records = sink();
  await createApusJudge({ ...nativeOptions, fetch: fake.fetch })(source, new AbortController().signal, records.record);
  assert.equal(fake.calls.filter(c => c.path === '/completion').length, 5);
  for (const s of recordedSubmissions(records.records) as any[]) {
    if (s.scopeId === 'ordinary:0') assert.doesNotMatch(s.payloadJson ?? JSON.stringify(s.payload), /HOST_FACT_SENTINEL|FACT_CONTENT_SENTINEL|resolvedAction/);
  }
});

for (const provider of ['apus', 'jev'] as const) for (const mode of ['confirmed', 'low', 'conflict', 'none', 'ordinary-fail', 'ordinary-unknown', 'ordinary-approval'] as const)
  test(`${provider} exemption ${mode} keeps protected provenance and gates`, async () => {
    const source = complete(), capture = sink();
    const ordinary = mode === 'ordinary-fail' ? 'FAIL' : mode === 'ordinary-unknown' ? 'UNKNOWN' : mode === 'ordinary-approval' ? 'APPROVAL_REQUIRED' : 'NOT_APPLICABLE';
    const required = ordinary === 'NOT_APPLICABLE';
    let result: any, calls: number;
    const rejected = mode === 'conflict' || mode === 'none';
    if (provider === 'jev') {
      const sdk = sdkScript((key, q) => ({ winner: key === 'rule_0_outcome' ? ordinary : key === 'rule_0_confirmation' ? mode === 'conflict' ? 'PASS' : 'NOT_APPLICABLE'
        : key === 'rule_0_facts' ? mode === 'none' ? 'NONE' : Object.keys(q.criteria)[1] : undefined,
        score: key === 'rule_0_confirmation' && mode === 'low' ? 0.89 : 1 }));
      const pending = runJev(source, sdk.fetch, undefined, capture.record);
      if (rejected) await assert.rejects(pending, /invalid-response/); else result = await pending;
      calls = sdk.bodies.length; assert.equal(calls, rejected ? 2 : 3);
      assert.equal('rule_0_confirmation' in sdk.bodies[1].questions, required);
    } else {
      const labels: Record<string, string> = { PASS: 'A', APPROVAL_REQUIRED: 'B', FAIL: 'C', UNKNOWN: 'D', NOT_APPLICABLE: 'E' };
      let scored = 0;
      const fake = scriptedNative({ winners: [labels[ordinary]!, 'A', mode === 'none' ? 'A' : 'B', ...(required ? [mode === 'conflict' ? 'A' : 'E'] : []), 'A', 'A'],
        mutate: (v,c) => {
          if (c.path === '/completion' && scored++ === 3 && mode === 'low') {
            for (const row of v.completion_probabilities[0].top_logprobs) row.logprob = Math.log(row.token === 'E' ? 0.89 : 0.0275);
          }
          return v;
        } });
      const pending = createApusJudge({ ...nativeOptions, fetch: fake.fetch })(source, new AbortController().signal, capture.record);
      if (rejected) await assert.rejects(pending, /invalid-response/); else result = await pending;
      calls = fake.calls.filter(c => c.path === '/completion').length;
      assert.equal(calls, rejected ? 4 : required ? 6 : 5);
    }
    if (rejected) { assert.ok(!capture.records.some(r => r.stage === 'validation' && r.data.valid)); return; }
    const final = result.rules[0];
    if (required) {
      assert.equal(final.outcome.choice, 'NOT_APPLICABLE');
      assert.deepEqual(final.factReferences, currentFactReferences(source.resolvedAction));
      assert.equal(final.applicabilitySupported, true); assert.equal(final.evidence, null);
      const confirmation = recordedSubmissions(capture.records).find((s: any) => s.status === 'completed' && s.confirmation) as any;
      assert.equal(confirmation.confirmation.factsReference, final.factReferences.digest);
      if (mode === 'low') assert.ok(Math.abs(final.outcome.probabilities.NOT_APPLICABLE - 0.89) < 1e-6);
    } else assert.equal(final.outcome.choice, ordinary);
    assert.equal(assessmentDecision(result, DEFAULTS, source.policy).decision, mode === 'confirmed' ? 'ALLOW' : mode === 'ordinary-approval' ? 'ASK' : 'BLOCK');
  });

for (const defect of ['unsupported', 'partial', 'stale', 'redacted', 'limited'] as const) test(`${defect} cannot add confirmation or exempt on high ordinary score`, async () => {
  const source: any = complete();
  if (defect === 'unsupported') delete source.resolvedAction;
  else if (defect === 'partial') { source.resolvedAction.status = 'authenticated-partial'; source.resolvedAction.facts.coverage = 'partial'; }
  else if (defect === 'stale') source.resolvedAction.facts.binding.callId = 'old';
  else if (defect === 'redacted') source.resolvedAction.redactedFields = 1;
  else source.resolvedAction.facts.limitations.push('missing effects');
  for (const provider of ['jev', 'apus']) {
    const capture = sink(); let result: any;
    if (provider === 'jev') {
      const sdk = sdkScript((key) => ({ winner: key === 'rule_0_outcome' ? 'NOT_APPLICABLE' : undefined }));
      result = await runJev(source, sdk.fetch, undefined, capture.record);
      assert.equal(sdk.bodies.length, 3); assert.ok(!('rule_0_confirmation' in sdk.bodies[1].questions));
    } else {
      const fake = scriptedNative({ winners: ['E','A','A','A','A'] });
      result = await createApusJudge({ ...nativeOptions, fetch: fake.fetch })(source, new AbortController().signal, capture.record);
      assert.equal(fake.calls.filter(c => c.path === '/completion').length, ['unsupported','partial'].includes(defect) ? 4 : 5);
    }
    assert.equal(assessmentDecision(result, DEFAULTS, source.policy).decision, 'BLOCK');
    assert.ok(!recordedSubmissions(capture.records).some((s: any) => s.confirmation));
  }
});

for (const failure of ['extra-key', 'missing-key', 'extra-criterion', 'low-type', 'model-change', 'http', 'cancel', 'late', 'stall', 'body-stall'] as const)
  test(`JEV ${failure} after ordinary group stops all later work without retries`, async () => {
    const controller = new AbortController(), capture = sink(); let calls = 0, release: (() => void) | undefined;
    const sdk = sdkScript();
    const fetcher: typeof fetch = async (url, init) => {
      calls++;
      if (calls === 1) return sdk.fetch(url, init);
      if (failure === 'cancel') { controller.abort(); return sdk.fetch(url, init); }
      if (failure === 'http') return new Response('private-error', { status: 503 });
      if (failure === 'late') { await new Promise(r => { release = () => r(undefined); }); return sdk.fetch(url, init); }
      if (failure === 'stall') return new Promise(() => {});
      if (failure === 'body-stall') return new Response(new ReadableStream({ start() {} }));
      const raw: any = await (await sdk.fetch(url, init)).json();
      if (failure === 'extra-key') raw.answers.extra = raw.answers.rule_0_facts;
      if (failure === 'missing-key') delete raw.answers.rule_0_facts;
      if (failure === 'extra-criterion') raw.answers.rule_0_facts.probabilities.forged = 0;
      if (failure === 'low-type') raw.answers.rule_0_facts.type = 'text';
      if (failure === 'model-change') raw.model = 'changed-model';
      return Response.json(raw);
    };
    await assert.rejects(runJev({ ...request, deadlineMs: ['late','stall','body-stall'].includes(failure) ? 40 : 5000 }, fetcher, controller.signal, capture.record),
      new RegExp(failure === 'cancel' ? 'cancelled' : ['late','stall','body-stall'].includes(failure) ? 'timeout' : failure === 'http' ? 'provider-error' : 'invalid-response'));
    assert.equal(calls, 2); assert.ok(!capture.records.some(r => r.stage === 'validation' && r.data.valid));
    const count = capture.records.length; release?.(); await new Promise(r => setTimeout(r, 10));
    assert.equal(calls, 2); assert.equal(capture.records.length, count);
  });

test('JEV shares a deadline across groups and forwards the same cancellation signal', async () => {
  const sdk = sdkScript(), signals: any[] = []; let calls = 0;
  await assert.rejects(runJev({ ...request, deadlineMs: 60 }, async (url, init) => {
    calls++; signals.push(init!.signal); await new Promise(r => setTimeout(r, 35)); return sdk.fetch(url, init);
  }), /timeout/);
  assert.equal(calls, 2); assert.equal(signals.at(-1).aborted, true);
});

test('required scoped overflow fails before either transport starts', async () => {
  assert.equal(boundEvidence(request, { recentEvents: 12, maxBytes: 1 }), null);
  const huge = { ...request, action: captureAction({ sessionId: 's', callId: 'c', toolName: 'read', arguments: { path: 'x'.repeat(50000) } }) };
  const never: typeof fetch = async () => { throw new Error('must not send'); };
  await assert.rejects(runJev(huge, never), /insufficient-evidence/);
  await assert.rejects(createApusJudge({ ...nativeOptions, fetch: never })(huge, new AbortController().signal), /insufficient-evidence/);
});
