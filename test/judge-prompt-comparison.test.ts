import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { comparisonPlan, readSizeCases, runComparison, selectApprovedFetch, sha256, FROZEN_SHA256,
  type ComparisonApproval, type Delivery } from '../eval/judge-prompt-comparison.js';
import { createSystemOneJudge } from '../src/decision/system-one.js';
import { createApusJudge } from '../src/decision/apus.js';
import { renderApus, sortedJson } from '../src/decision/apus-renderer.js';
import { backendIdentity } from '../src/decision/apus-native.js';
import { assessmentDecision } from '../src/decision/decide.js';
import { APUS_MODEL, scriptedNative, nativeModels, nativeProps, tokenIds } from './apus-scripted.js';
import { boundHistoricalEvidence } from '../eval/evidence-selection-history.js';
import { judgeState } from '../src/decision/judge-evidence.js';

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
const frozenText = readFileSync(new URL('./fixtures/judge-prompts/v8-read-00.json', import.meta.url), 'utf8');
const frozen = JSON.parse(frozenText);
const delivery: Delivery = { baseUrl: 'http://127.0.0.1:8088', backend: backendIdentity(nativeModels(), nativeProps(), APUS_MODEL),
  operatorCpuStopMethod: 'SYNTHETIC TEST RECORD ONLY: Ctrl-C in foreground Pika server terminal; verify process exit',
  outputDirectory: '/tmp/synthetic-comparison', retention: 'SYNTHETIC TEST RECORD ONLY: seven days then operator deletes report' };
const approval = (planSha256: string): ComparisonApproval => ({ planSha256, operator: 'synthetic-test-operator-not-Koen',
  authorizationRef: 'synthetic-scoped-standing-USER-record-not-live-authorization',
  recordedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() });

test('frozen canonical baseline, thresholds, exact identities and request ceilings remain fixed', () => {
  const plan = comparisonPlan();
  assert.equal(sha256(frozenText), FROZEN_SHA256);
  assert.equal(plan.frozenSha256, FROZEN_SHA256);
  assert.equal(plan.fixtureId, 'read-00'); assert.equal(plan.delivery, null);
  assert.deepEqual(plan.sides.baseline.questions, frozen.questions);
  assert.deepEqual(JSON.parse(plan.sides.baseline.submissions[0]!.stateJson), judgeState(boundHistoricalEvidence(frozen.request)!));
  assert.equal(plan.policyCombinedDigest, frozen.request.policy.combinedDigest);
  assert.deepEqual(plan.policySourceDigests, frozen.request.policy.sources.map((s: any) => ({ role: s.role, digest: s.digest })));
  assert.equal(plan.sides.baseline.questionSha256, 'da53738494f8eb55835c049476b661ae5e2296372d0c6a9b87126cc219bf5452');
  assert.equal(plan.fixtureSha256, 'b2802fbc52f0cf34d3cad50d05380bbb4cf035c1eb96f14f820c5cb3a076b457');
  assert.equal(plan.sides.baseline.inputVersion, 'bounded-history-v2');
  assert.equal(plan.sides.baseline.nativeCaptureVersion, 'apus-recording-v1');
  assert.equal(plan.sides.candidate.questionVersion, 'policy-rules-v9-scoped');
  assert.equal(plan.sides.candidate.inputVersion, 'judge-input-scopes-v1');
  assert.equal(plan.sides.candidate.nativeCaptureVersion, 'apus-recording-v2');
  assert.equal(plan.sides.candidate.profile, 'applicability-v1');
  assert.deepEqual(plan.config, { effectThreshold: 0.9, evidenceThreshold: 0.9, deadlineMs: 240000 });
  assert.deepEqual(plan.bounds, { assessments: 2, scoredCompletions: 8, httpRequests: 76, httpPerSide: 38, assessmentMs: 240000, pairMs: 480000, cpuSeconds: 2880 });
  for (const side of Object.values(plan.sides)) {
    assert.deepEqual(side.prompts.map(p => p.httpCeiling), [12, 6, 10, 6]);
    assert.deepEqual(Object.keys(side.questions.rule_0_facts!.criteria), ['NONE']);
    assert.equal(side.request.resolvedAction?.status ?? 'unsupported', 'unsupported');
  }
  assert.ok(Object.isFrozen(plan.sides.candidate.request));
});

for (const row of readSizeCases()) test(`${row.id} counts all actual normal APUS/JEV scopes and duplicated mandatory bytes`, async () => {
  const { candidate, baseline } = row;
  const jevBodies: any[] = [];
  const jevFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string); jevBodies.push(body);
    return Response.json({ model: 'scripted-model-not-live', answers: Object.fromEntries(Object.entries(body.questions).map(([key, q]: [string, any]) => {
      const keys = Object.keys(q.criteria), winner = keys[0]!;
      return [key, { type: 'choice', choice: winner, confidence: 1, probabilities: Object.fromEntries(keys.map(k => [k, +(k === winner)])) }];
    })) });
  };
  await createSystemOneJudge({ baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', auth: { type: 'bearer', token: 'offline-script-only' }, fetch: jevFetch })(candidate.request, new AbortController().signal);
  assert.deepEqual(jevBodies.map(b => JSON.stringify(b)), candidate.submissions.map(s => s.payloadJson));
  assert.equal(jevBodies.length, 3);
  assert.equal(candidate.sizes.jevPayloadBytes, jevBodies.reduce((n, b) => n + bytes(JSON.stringify(b)), 0));
  assert.equal(candidate.sizes.preparedStateBytes, jevBodies.reduce((n, b) => n + bytes(JSON.stringify(b.state)), 0));
  assert.equal(candidate.sizes.preparedStateBytes, candidate.request.judgeScopes!.totalStateBytes);
  const ordinary = jevBodies[0].state, exemption = jevBodies[1].state, protection = jevBodies[2].state;
  assert.deepEqual(Object.keys(ordinary), ['rule', 'thinkingTrace', 'previousToolCall', 'proposedToolCall']);
  assert.equal(ordinary.thinkingTrace.status, row.id[5] === '1' ? 'present' : 'unavailable');
  assert.deepEqual(ordinary.previousToolCall, row.id[6] === '1' ? { toolName: 'read', arguments: { path: '/synthetic/NOTES.md' } } : null);
  assert.deepEqual(exemption.allowedFactReferences, null);
  assert.deepEqual(protection.policy.candidates, frozen.request.policy.candidates);
  assert.deepEqual(protection.policy.targets, frozen.state.integrity.targets);
  assert.deepEqual(protection.resolvedAction, frozen.state.resolvedAction);
  for (const state of [ordinary, exemption, protection]) assert.deepEqual(state.proposedToolCall, frozen.fixture.input);
  for (const state of [exemption, protection]) assert.doesNotMatch(JSON.stringify(state), /thinkingTrace|previousToolCall|trajectory/);
  const fake = scriptedNative();
  await createApusJudge({ baseUrl: delivery.baseUrl, model: APUS_MODEL, fetch: fake.fetch })(candidate.request, new AbortController().signal);
  const chats = fake.calls.filter(c => c.path === '/tokenize' && c.body.content.endsWith('</think>\n\n')).map(c => c.body.content);
  assert.deepEqual(chats, candidate.prompts.map(p => p.chat));
  assert.deepEqual(fake.calls.filter(c => c.path === '/completion').map(c => c.body.prompt), chats.map(tokenIds));
  assert.equal(fake.calls.length, 38);
  for (const side of [baseline, candidate]) {
    assert.equal(side.sizes.preparedStateBytes, side.submissions.reduce((n, s) => n + bytes(s.stateJson), 0));
    assert.equal(side.sizes.nativeChatBytes, side.prompts.reduce((n, p) => n + bytes(p.chat), 0));
    assert.equal(side.sizes.nativeStateBytes, side.prompts.reduce((n, p) => n + p.stateBytes, 0));
    assert.equal(side.sizes.nativeApplicationBytes, side.prompts.reduce((n, p) => n + bytes(p.payloadJson), 0));
    assert.equal(side.sizes.allInstructionsBytes, side.submissions.reduce((n, s) => n + Object.values(s.questions).reduce((n, q) => n + bytes(q.instructions), 0), 0));
    for (const s of side.submissions) assert.equal(s.payloadSha256, sha256(s.payloadJson));
    for (const p of side.prompts) {
      const payload = JSON.parse(p.payloadJson), question = payload.questions[p.key];
      assert.equal(p.chat, renderApus({ state: sortedJson(payload.state), instructions: question.instructions,
        criteria: Object.entries(question.criteria).map(([id, description]) => ({ id, description: description as string })) }).chat);
      assert.equal(p.chatSha256, sha256(p.chat));
    }
  }
  assert.ok(candidate.sizes.nativeChatBytes < baseline.sizes.nativeChatBytes);
  assert.ok(candidate.sizes.jevPayloadBytes < baseline.sizes.jevPayloadBytes);
});

test('complete scripted pair reports full latency, token provenance, labels, pure gates and all 76 requests', async () => {
  const plan = comparisonPlan(), fake = scriptedNative();
  const report = await runComparison(plan, { scriptedFetch: fake.fetch });
  assert.deepEqual(report.counts, { planned: 2, started: 2, complete: 2, failed: 0, unstarted: 0 });
  assert.equal(report.httpRequests, 76); assert.equal(fake.calls.length, 76);
  assert.deepEqual(report.agreement, { matches: 2, denominator: 2 });
  assert.equal(report.mode, 'scripted-offline'); assert.equal(report.execution, 'not-executed'); assert.equal(report.enforcementPermission, 'not-granted');
  assert.equal(fake.calls.filter(c => c.path === '/completion').length, 8);
  const promptCalls = fake.calls.filter(c => c.path === '/tokenize' && c.body.content.endsWith('</think>\n\n'));
  assert.deepEqual(promptCalls.map(c => sha256(c.body.content)), [...plan.sides.baseline.prompts, ...plan.sides.candidate.prompts].map(p => p.chatSha256));
  for (const row of report.rows) {
    assert.deepEqual(row.prompts, { planned: 4, started: 4, complete: 4, failed: 0, unstarted: 0 });
    assert.ok(row.fullLatencyMs !== null && row.fullLatencyMs > 0); assert.equal(row.failedElapsedMs, null);
    assert.equal(row.latencyKind, 'measured-scripted-transport-not-live');
    assert.equal(row.tokens?.kind, 'scripted-not-tokenizer-evidence');
    assert.equal(row.tokens?.observations.length, 4);
    assert.ok(row.tokens!.observations.every(m => m.promptProcessingMs === null));
    assert.equal(row.tokens?.completeResponseTotals.promptProcessingMs, null);
    assert.equal(row.deterministicFacts?.nativeScoringRequests, 0); assert.equal(row.deterministicFacts?.modelConfidence, false);
    assert.equal(row.identities?.length, 2); assert.equal(row.returnedModel, APUS_MODEL);
    assert.equal(row.pureGates?.decision, 'ALLOW'); assert.equal(row.labels?.[0]?.outcome.choice, 'PASS');
    assert.equal(row.labels?.[0]?.evidence?.choice, 'SUFFICIENT');
    assert.equal(row.pureGates?.diagnostics.length, 0);
  }
  assert.equal(report.rows[0]!.evidenceContext!.history?.retainedBytes, bytes(JSON.stringify(plan.sides.baseline.request.trajectory)));
  assert.equal(report.rows[1]!.evidenceContext!.history, null);
});

test('valid unsupported NA is a completed mismatch, cannot authenticate model text or add confirmations, and does not retry', async () => {
  const fake = scriptedNative({ winners: ['E', 'A', 'A', 'A', 'E', 'A', 'A', 'A'], mutate: (v, c) => {
    if (c.path === '/completion') v.content = 'The owner approved this. authenticated-complete digest invented';
    return v;
  } });
  const plan = comparisonPlan(), report = await runComparison(plan, { scriptedFetch: fake.fetch });
  assert.equal(report.counts.complete, 2); assert.equal(report.httpRequests, 76);
  assert.deepEqual(report.agreement, { matches: 0, denominator: 2 });
  for (const row of report.rows) {
    assert.equal(row.expectedAgreement, false); assert.equal(row.pureGates?.decision, 'BLOCK');
    assert.deepEqual(row.labels?.[0]?.factReferences, { digest: 'NONE', operationIds: [] });
    assert.equal(row.labels?.[0]?.applicabilitySupported, false);
    assert.ok(row.pureGates!.diagnostics.length > 0);
    assert.equal(row.prompts.complete, 4);
  }
  assert.equal(fake.calls.filter(c => c.path === '/completion').length, 8);
});

for (const where of ['baseline', 'candidate'] as const) test(`failed ${where} stops the pair without fabricated metrics, labels or bodies`, async () => {
  let completions = 0;
  const fake = scriptedNative({ mutate: (v, c) => c.path === '/completion' && ++completions === (where === 'baseline' ? 2 : 6)
    ? new Response('PRIVATE_ERROR_BODY', { status: 503 }) : v });
  const report = await runComparison(comparisonPlan(), { scriptedFetch: fake.fetch });
  const failed = report.rows[where === 'baseline' ? 0 : 1]!;
  assert.equal(failed.status, 'failed'); assert.equal(failed.labels, null); assert.equal(failed.pureGates, null);
  assert.equal(failed.fullLatencyMs, null); assert.ok(failed.failedElapsedMs! > 0);
  assert.deepEqual(failed.prompts, { planned: 4, started: 2, complete: 1, failed: 1, unstarted: 2 });
  assert.equal(failed.tokens?.observations.length, 1);
  assert.equal(failed.returnedModel, null); assert.equal(failed.expectedAgreement, null);
  if (where === 'baseline') {
    const unstarted = report.rows[1]!;
    assert.deepEqual(report.counts, { planned: 2, started: 1, complete: 0, failed: 1, unstarted: 1 });
    assert.equal(unstarted.status, 'unstarted'); assert.equal(unstarted.tokens, null); assert.equal(unstarted.fullLatencyMs, null);
    assert.equal(unstarted.labels, null); assert.equal(unstarted.identities, null);
    assert.deepEqual(unstarted.prompts, { planned: 4, started: 0, complete: 0, failed: 0, unstarted: 4 });
  } else assert.equal(report.counts.complete, 1);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_ERROR_BODY'));
});

test('scoped standing USER authorization selects the live path without a native reference; fixture HTTP stays synthetic', async () => {
  const plan = comparisonPlan(delivery);
  const record: ComparisonApproval = { planSha256: plan.planSha256, operator: 'synthetic-test-operator-not-Koen',
    authorizationRef: 'synthetic-scoped-standing-USER-record-not-live-authorization',
    recordedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() };
  const original = globalThis.fetch, fake = scriptedNative(); globalThis.fetch = fake.fetch;
  try {
    assert.equal(selectApprovedFetch(plan, record, fake.fetch), fake.fetch);
    const report = await runComparison(plan, { approval: record });
    assert.equal(report.mode, 'approved-live');
    assert.equal(report.httpRequests, 76); assert.equal(fake.calls.length, 76);
    assert.equal(report.counts.complete, 2);
  } finally { globalThis.fetch = original; }
});

test('missing or mismatched separate approval means zero requests; no live authorization is generated', async () => {
  const original = globalThis.fetch, fake = scriptedNative(); globalThis.fetch = fake.fetch;
  try {
    const plan = comparisonPlan(delivery), record = approval(plan.planSha256);
    for (const denied of [undefined, { ...record, planSha256: 'wrong' }, { ...record, operator: '' },
      { ...record, authorizationRef: '' }, { ...record, authorizationRef: '   ' }, { ...record, operator: '   ' },
      { ...record, recordedAt: 'invalid' }, { ...record, recordedAt: new Date(Date.now() + 60000).toISOString() },
      { ...record, expiresAt: 'invalid' }, { ...record, expiresAt: '2000-01-01T00:00:00Z' }]) {
      const report = await runComparison(plan, { approval: denied });
      assert.equal(report.mode, 'approval-denied'); assert.equal(report.httpRequests, 0);
      assert.deepEqual(report.counts, { planned: 2, started: 0, complete: 0, failed: 0, unstarted: 2 });
      for (const row of report.rows) { assert.equal(row.tokens, null); assert.equal(row.fullLatencyMs, null); assert.equal(row.labels, null); }
    }
    assert.equal(fake.calls.length, 0);
    assert.equal(selectApprovedFetch(plan, record, fake.fetch), fake.fetch); // Selection only, never execution.
    assert.throws(() => selectApprovedFetch(comparisonPlan(), record, fake.fetch), /approval-required/);
  } finally { globalThis.fetch = original; }
});

test('all required standing authorization fields must be present before any HTTP', async () => {
  const plan = comparisonPlan(delivery), record = approval(plan.planSha256);
  const original = globalThis.fetch, fake = scriptedNative(); globalThis.fetch = fake.fetch;
  try {
    for (const field of ['planSha256', 'operator', 'authorizationRef', 'recordedAt', 'expiresAt'] as const) {
      const denied = { ...record }; delete (denied as Partial<ComparisonApproval>)[field];
      const report = await runComparison(plan, { approval: denied });
      assert.equal(report.mode, 'approval-denied'); assert.equal(report.httpRequests, 0);
      assert.equal(report.counts.unstarted, 2);
    }
    assert.equal(fake.calls.length, 0);
  } finally { globalThis.fetch = original; }
});

for (const field of ['payload', 'model', 'runtime', 'counts', 'capture', 'destination', 'stop', 'output', 'retention', 'threshold', 'implementation'])
  test(`approval binds exact ${field} identity and detects drift even with an unchanged stored digest`, async () => {
    const plan = comparisonPlan(delivery), changed = structuredClone(plan), record = approval(plan.planSha256);
    if (field === 'payload') changed.sides.candidate.request.action.arguments = { path: '/synthetic/OTHER.md' };
    if (field === 'model') changed.model = 'unapproved-model';
    if (field === 'runtime') changed.runtime.threads = 8;
    if (field === 'counts') changed.bounds.httpRequests = 100;
    if (field === 'capture') changed.capture = 'normal-archive';
    if (field === 'destination') changed.delivery!.baseUrl = 'http://127.0.0.1:9999';
    if (field === 'stop') changed.delivery!.operatorCpuStopMethod = 'different';
    if (field === 'output') changed.delivery!.outputDirectory = '/tmp/other';
    if (field === 'retention') changed.delivery!.retention = 'forever';
    if (field === 'threshold') changed.config.effectThreshold = 0;
    if (field === 'implementation') changed.implementationSha256 = 'other';
    const fake = scriptedNative();
    assert.throws(() => selectApprovedFetch(changed, record, fake.fetch), /approval-required/);
    const report = await runComparison(changed, { scriptedFetch: fake.fetch, approval: record });
    assert.equal(report.httpRequests, 0); assert.equal(fake.calls.length, 0);
  });

test('a backend metadata change stops before any completion; partial endpoint results never form an assessment', async () => {
  const fake = scriptedNative({ mutate: (v, c) => {
    if (c.path === '/props') v.model_path = '/offline/other-model.gguf'; return v;
  } });
  const report = await runComparison(comparisonPlan(delivery), { scriptedFetch: fake.fetch });
  assert.equal(report.counts.complete, 0); assert.equal(report.counts.unstarted, 1);
  assert.equal(fake.calls.filter(c => c.path === '/completion').length, 0);
  assert.equal(report.rows[0]!.labels, null); assert.equal(report.rows[0]!.pureGates, null);
});

test('common pure gates retain low-score blocking for the same complete assessment and thresholds', async () => {
  const fake = scriptedNative({ mutate: (v, c) => {
    if (c.path === '/completion') for (const row of v.completion_probabilities[0].top_logprobs) row.logprob = Math.log(row.token === 'A' ? 0.89 : 0.11 / (v.completion_probabilities[0].top_logprobs.length - 1));
    return v;
  } });
  const plan = comparisonPlan(), report = await runComparison(plan, { scriptedFetch: fake.fetch });
  assert.equal(report.counts.complete, 2);
  for (const row of report.rows) assert.equal(row.pureGates?.decision, 'BLOCK');
  const toAssessment = (row: typeof report.rows[number]) => ({ profile: 'applicability-v1' as const, model: row.returnedModel!, rules: row.labels! });
  assert.deepEqual(assessmentDecision(toAssessment(report.rows[0]!), plan.config, plan.sides.baseline.request.policy),
    assessmentDecision(toAssessment(report.rows[1]!), plan.config, plan.sides.candidate.request.policy));
});


test('scripted provider timing/token fields are retained, and incomplete totals stay unavailable', async () => {
  let completion = 0;
  const fake = scriptedNative({ mutate: (v, c) => {
    if (c.path === '/completion') {
      v.timings.prompt_ms = 12.5;
      if (++completion === 5) delete v.tokens_cached;
    }
    return v;
  } });
  const report = await runComparison(comparisonPlan(), { scriptedFetch: fake.fetch });
  assert.equal(report.rows[0]!.tokens?.completeResponseTotals.promptProcessingMs, 50);
  assert.equal(report.rows[0]!.tokens?.completeResponseTotals.predictedTokens, 4);
  assert.equal(report.rows[0]!.tokens?.completeResponseTotals.cacheTokens, 0); // Explicit scripted counter, not a default.
  assert.equal(report.rows[1]!.tokens?.completeResponseTotals.cacheTokens, null);
  assert.equal(report.rows[1]!.tokens?.observations[0]!.cacheTokens, null);
  assert.equal(report.rows[1]!.tokens?.completeResponseTotals.promptProcessingMs, 50);
});

test('pre-cancelled scripted work leaves both sides unstarted with no metrics or requests', async () => {
  const controller = new AbortController(), fake = scriptedNative(); controller.abort();
  const report = await runComparison(comparisonPlan(), { scriptedFetch: fake.fetch, signal: controller.signal });
  assert.equal(report.counts.unstarted, 2); assert.equal(report.httpRequests, 0); assert.equal(fake.calls.length, 0);
  for (const row of report.rows) {
    assert.equal(row.fullLatencyMs, null); assert.equal(row.failedElapsedMs, null); assert.equal(row.latencyKind, null);
    assert.equal(row.tokens, null); assert.equal(row.labels, null); assert.equal(row.expectedAgreement, null);
  }
});


test('cancellation during scored work stops the pair and cannot complete partial answers', async () => {
  const controller = new AbortController();
  const fake = scriptedNative({ mutate: (v, c) => { if (c.path === '/completion') controller.abort(); return v; } });
  const report = await runComparison(comparisonPlan(), { scriptedFetch: fake.fetch, signal: controller.signal });
  assert.deepEqual(report.counts, { planned: 2, started: 1, complete: 0, failed: 1, unstarted: 1 });
  assert.equal(fake.calls.filter(c => c.path === '/completion').length, 1);
  assert.equal(report.rows[0]!.failure, 'cancelled'); assert.equal(report.rows[0]!.fullLatencyMs, null);
  assert.equal(report.rows[0]!.labels, null); assert.equal(report.rows[1]!.tokens, null);
});
