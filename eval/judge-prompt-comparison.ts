import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { JudgeFailure, type Assessment, type JudgeRequest, type Json } from '../src/decision/contracts.js';
import { boundEvidence, judgeState, prepareJudgeScopes, scopedEvidenceContext } from '../src/decision/judge-evidence.js';
import { buildQuestions } from '../src/decision/questions.js';
import { createApusJudge } from '../src/decision/apus.js';
import { assessmentBudget } from '../src/decision/assessment-budget.js';
import { APUS_RENDERING_VERSION, APUS_REVISION, renderApus, sortedJson } from '../src/decision/apus-renderer.js';
import { backendIdentity, nativeTokens, scoreCompletion } from '../src/decision/apus-native.js';
import { NativeFailure, nativeTransport } from '../src/decision/apus-transport.js';
import { assembleRecordedAssessment, type Answer } from '../src/decision/assessment-answers.js';
import { assessmentDecision, validateAssessment } from '../src/decision/decide.js';
import { freeze } from '../src/decision/evidence.js';
import { Observations } from '../src/decision/trajectory.js';
import type { RecordingSink } from '../src/recording/contract.js';
import { boundHistoricalEvidence } from './evidence-selection-history.js';
import { APUS_MODEL, scriptedNative } from '../test/apus-scripted.js';

const frozenText = readFileSync(new URL('../test/fixtures/judge-prompts/v8-read-00.json', import.meta.url), 'utf8');
const frozen = JSON.parse(frozenText);
export const FROZEN_SHA256 = '6d335477e3e1517340866efd3d95e2ad69ce3fb41a40a28b8db319ac1e7c0afe';
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
const config = { ...frozen.thresholds, deadlineMs: 240000 };
type Questions = ReturnType<typeof buildQuestions>;
const render = (state: unknown, q: Questions[string]) => renderApus({ state: sortedJson(state as Json), instructions: q.instructions,
  criteria: Object.entries(q.criteria).map(([id, description]) => ({ id, description: description as string })) });

// Fixed test data and existing preparation only. This is not a second question builder.
function prepareRead(hasTrace = false, hasPrevious = false) {
  if (sha256(frozenText) !== FROZEN_SHA256) throw new Error('frozen-baseline-changed');
  const history = new Observations(frozen.request.action.sessionId);
  if (hasPrevious) history.addHistory([{ kind: 'tool-call', callId: 'previous', toolName: 'read', data: { path: '/synthetic/NOTES.md' } }]);
  const source: JudgeRequest = { ...structuredClone(frozen.request), trajectory: hasPrevious ? history.snapshot() : structuredClone(frozen.request.trajectory) };
  const baseline = boundHistoricalEvidence(source);
  const candidate = boundEvidence(source);
  if (!baseline || !candidate) throw new Error('comparison-admission-failed');
  const scopes = prepareJudgeScopes(candidate, hasTrace ? { thinkingTrace: { status: 'present', text: 'I will read the synthetic README.' } } : {})!;
  const prepared = { ...candidate, judgeScopes: scopes, evidenceContext: scopedEvidenceContext(candidate, scopes) };
  if (scopes.exemptionSupported || source.resolvedAction?.status === 'authenticated-complete') throw new Error('comparison-resolution-drift');
  return { baseline, candidate: prepared };
}
function side(request: JudgeRequest, scoped: boolean) {
  const questions: Questions = scoped ? buildQuestions(request.policy, request.resolvedAction) : structuredClone(frozen.questions);
  const groups = scoped ? request.judgeScopes!.groups : [{ id: 'shared-v8', kind: 'shared-v8', state: judgeState(request), questionKeys: Object.keys(questions) }];
  const submissions = groups.map(g => {
    const selected = Object.fromEntries(g.questionKeys.map(key => [key, questions[key]!]));
    const payloadJson = JSON.stringify({ model: 'jev-latest', state: g.state, questions: selected });
    return { scopeId: g.id, fields: Object.keys(g.state), stateJson: JSON.stringify(g.state), stateBytes: bytes(JSON.stringify(g.state)),
      questions: selected, instructionsBytes: Object.values(selected).reduce((n, q) => n + bytes(q.instructions), 0),
      payloadJson, payloadBytes: bytes(payloadJson), payloadSha256: sha256(payloadJson) };
  });
  const prompts = groups.flatMap(g => g.questionKeys.filter(key => Object.keys(questions[key]!.criteria).length > 1).map(key => {
    const q = questions[key]!, rendered = render(g.state, q);
    const payloadJson = JSON.stringify({ model: APUS_MODEL, state: g.state, questions: { [key]: q } });
    return { scopeId: g.id, key, payloadJson, payloadBytes: bytes(payloadJson), stateBytes: bytes(sortedJson(g.state as Json)),
      instructionsBytes: bytes(q.instructions), chat: rendered.chat, chatBytes: bytes(rendered.chat), chatSha256: sha256(rendered.chat), mapping: rendered.mapping,
      httpCeiling: 2 + 2 * Object.keys(q.criteria).length };
  }));
  if (prompts.length !== 4 || prompts.reduce((n, p) => n + p.httpCeiling, 4) !== 38
    || Object.keys(questions.rule_0_facts!.criteria).join() !== 'NONE') throw new Error('comparison-count-drift');
  return { questionVersion: scoped ? 'policy-rules-v9-scoped' : frozen.questionVersion,
    inputVersion: scoped ? 'judge-input-scopes-v1' : request.evidenceContext!.selectionVersion,
    nativeCaptureVersion: scoped ? 'apus-recording-v2' : 'apus-recording-v1', profile: frozen.profile,
    questionSha256: sha256(JSON.stringify(questions)), evidenceContext: request.evidenceContext,
    request, questions, mapping: scoped ? request.judgeScopes!.entries : frozen.mapping, submissions, prompts,
    sizes: { preparedStateBytes: submissions.reduce((n, s) => n + s.stateBytes, 0),
      allInstructionsBytes: submissions.reduce((n, s) => n + s.instructionsBytes, 0),
      jevSubmissions: submissions.length, jevPayloadBytes: submissions.reduce((n, s) => n + s.payloadBytes, 0),
      nativePrompts: prompts.length, nativeStateBytes: prompts.reduce((n, p) => n + p.stateBytes, 0),
      nativeInstructionsBytes: prompts.reduce((n, p) => n + p.instructionsBytes, 0),
      nativeApplicationBytes: prompts.reduce((n, p) => n + p.payloadBytes, 0), nativeChatBytes: prompts.reduce((n, p) => n + p.chatBytes, 0) } };
}
export function readSizeCases() {
  return [false, true].flatMap(trace => [false, true].map(previous => {
    const prepared = prepareRead(trace, previous);
    return { id: `read-${+trace}${+previous}`, baseline: side(prepared.baseline, false), candidate: side(prepared.candidate, true) };
  }));
}
export interface Delivery {
  baseUrl: string; backend: ReturnType<typeof backendIdentity>;
  operatorCpuStopMethod: string; outputDirectory: string; retention: string;
}
export function comparisonPlan(delivery: Delivery | null = null) {
  const prepared = prepareRead();
  const implementationFiles = ['judge-prompt-comparison.ts', 'evidence-selection-history.ts'].map(f => new URL(f, import.meta.url));
  for (const f of ['apus', 'apus-native', 'apus-renderer', 'apus-transport', 'assessment-budget', 'assessment-answers', 'assessment-contract',
    'assessment-shape', 'judge-evidence', 'questions', 'history-selection', 'history-content', 'evidence-context', 'decide', 'diagnostics', 'response-validation'])
    implementationFiles.push(new URL(`../src/decision/${f}.ts`, import.meta.url));
  const body = { planVersion: 'judge-prompt-comparison-v1', fixtureId: 'read-00', startingCommit: frozen.startingCommit,
    frozenSha256: FROZEN_SHA256, fixtureSha256: sha256(JSON.stringify(frozen.fixture)), policyCombinedDigest: frozen.request.policy.combinedDigest,
    policySourceDigests: frozen.request.policy.sources.map((s: { role: string; digest: string }) => ({ role: s.role, digest: s.digest })),
    implementationSha256: sha256(implementationFiles.map(f => sha256(readFileSync(f, 'utf8'))).join('\n')),
    model: APUS_MODEL, renderingVersion: APUS_RENDERING_VERSION, rendererRevision: APUS_REVISION, protocol: 'llamacpp-b11118-choice-v1',
    runtime: { host: 'Pika', cpu: 'i5-12500', model: 'APUS OpenJev v1 4B Q8_0', architecture: 'qwen35',
      build: 'b11118', revision: 'e6ab7c1a41054a888ada952eab4c886444c2f5ad', cpuOnly: true, threads: 6, batchThreads: 6, slots: 1, context: 32768 },
    config, bounds: { assessments: 2, scoredCompletions: 8, httpRequests: 76, httpPerSide: 38, assessmentMs: 240000, pairMs: 480000, cpuSeconds: 2880 },
    capture: 'report-only; native bodies transient; no normal archive or provider-body log', delivery,
    expected: { user: 'PASS', userEvidence: 'SUFFICIENT', protection: 'PASS', protectionEvidence: 'SUFFICIENT', pureGate: 'ALLOW' },
    scopeChange: 'Both wording and data layout change. Ordinary context excludes results/history/cwd/policy metadata/host facts. Protected scopes remain separate. V8 has no thinking field.',
    sides: { baseline: side(prepared.baseline, false), candidate: side(prepared.candidate, true) } };
  return freeze({ ...body, planSha256: sha256(JSON.stringify(body)) });
}
export type ComparisonPlan = ReturnType<typeof comparisonPlan>;
function currentPlan(plan: ComparisonPlan) {
  const { planSha256, ...body } = plan;
  return sha256(JSON.stringify(body)) === planSha256 && comparisonPlan(plan.delivery).planSha256 === planSha256;
}
export interface ComparisonApproval {
  planSha256: string; operator: string; authorizationRef: string; recordedAt: string; expiresAt: string;
}
// The trusted entry verifies scoped USER authorization and sealed workload bindings.
// This helper checks the record and plan, not BB evidence or assessment authenticated facts.
// No environment, model string, source approval or CLI flag grants this approval.
export function selectApprovedFetch(plan: ComparisonPlan, approval?: ComparisonApproval, realFetch?: typeof fetch, now = Date.now()): typeof fetch {
  const delivery = plan.delivery;
  if (!delivery || !currentPlan(plan) || !approval || approval.planSha256 !== plan.planSha256
    || ![approval.operator, approval.authorizationRef, delivery.operatorCpuStopMethod, delivery.retention].every(s => typeof s === 'string' && !!s.trim())
    || !/^http:\/\/127\.0\.0\.1:\d+$/.test(delivery.baseUrl) || !delivery.outputDirectory.startsWith('/')
    || delivery.backend.model !== plan.model || delivery.backend.context !== 32768 || !delivery.backend.modelPath.startsWith('/')
    || !delivery.backend.build.includes('b11118') || !delivery.backend.build.includes('e6ab7c1a4')
    || !Number.isFinite(Date.parse(approval.recordedAt)) || Date.parse(approval.recordedAt) > now
    || !Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= now) throw new Error('comparison-approval-required');
  return realFetch ?? globalThis.fetch;
}

// Only the frozen fixed baseline gets this native loop. No production legacy selector.
async function baselineAssessment(plan: ComparisonPlan, fetcher: typeof fetch, signal: AbortSignal,
  scored: () => void, metadataObserved: (identity: ReturnType<typeof backendIdentity>) => void, completionObserved: (key: string, raw: any) => void) {
  const side = plan.sides.baseline, transport = nativeTransport(plan.delivery?.baseUrl ?? 'http://127.0.0.1:8088', 240000, signal, fetcher);
  try {
    const metadata = async () => {
      const identity = backendIdentity(await transport.json('/v1/models'), await transport.json('/props'), plan.model);
      metadataObserved(identity); return identity;
    };
    const identity = await metadata(), answers: Record<string, Answer> = { rule_0_facts: { type: 'choice', choice: 'NONE', probabilities: { NONE: 1 }, confidence: 1 } };
    const tokenize = async (text: string) => nativeTokens(await transport.json('/tokenize', { content: text, add_special: false, parse_special: true, with_pieces: false }), identity.vocab);
    for (const p of side.prompts) {
      const tokens = await tokenize(p.chat), labelIds: Record<string, number> = {};
      if (tokens.length + 2 > identity.context) throw new NativeFailure('context-overflow');
      for (const label of Object.keys(p.mapping)) {
        const single = await tokenize(label), appended = await tokenize(p.chat + label);
        if (single.length !== 1 || appended.length !== tokens.length + 1 || appended.at(-1) !== single[0]
          || !tokens.every((id, i) => appended[i] === id) || Object.values(labelIds).includes(single[0]!)) throw new NativeFailure('label-boundary');
        labelIds[label] = single[0]!;
      }
      const raw = await transport.json('/completion', { model: plan.model, prompt: tokens, stream: false, n_predict: 1, n_probs: 1024,
        temperature: 0, cache_prompt: true, post_sampling_probs: false, return_tokens: true });
      transport.check();
      completionObserved(p.key, raw);
      answers[p.key] = scoreCompletion(raw, p.mapping, labelIds, tokens.length, identity); scored();
    }
    if (JSON.stringify(await metadata()) !== JSON.stringify(identity)) throw new NativeFailure('backend-changed');
    transport.check();
    return assembleRecordedAssessment({ model: identity.model, answers }, side.questions, side.mapping, side.request.policy, side.request);
  } finally { transport.close(); }
}
const metric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export interface ComparisonDeadline {
  readonly signal: AbortSignal;
  readonly checkDeadline: () => void;
  readonly remainingMs: () => number;
}
export interface ComparisonLifecycleObserver {
  start(event: Readonly<{ side: 'baseline' | 'candidate'; deadline: ComparisonDeadline }>): void | Promise<void>;
  // A failed end receives an independent 10000 ms cleanup view, not an expired assessment view.
  end(event: Readonly<{ side: 'baseline' | 'candidate'; status: 'complete' | 'failed'; failure: string | null; deadline: ComparisonDeadline }>): void | Promise<void>;
}
export async function runComparison(plan: ComparisonPlan, options: { scriptedFetch?: typeof fetch; approval?: ComparisonApproval; signal?: AbortSignal; observer?: ComparisonLifecycleObserver } = {}) {
  const scripted = !!options.scriptedFetch;
  let fetcher: typeof fetch | undefined;
  try { fetcher = options.scriptedFetch ?? selectApprovedFetch(plan, options.approval); } catch { /* Return an explicitly unstarted report. */ }
  if (!currentPlan(plan)) fetcher = undefined;
  const controller = new AbortController(), cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(cancel, plan.bounds.pairMs);
  const rows = [];
  let stopped = !fetcher, pairRequests = 0;
  try {
    for (const name of ['baseline', 'candidate'] as const) {
      const side = plan.sides[name];
      let requests = 0, startedPrompts = 0, completedPrompts = 0, identityProblem = false;
      const observations: { question: string; promptTokens: number | null; predictedTokens: number | null; promptProcessingMs: number | null; cacheTokens: number | null }[] = [];
      const identities: ReturnType<typeof backendIdentity>[] = [];
      const metadataObserved = (identity: ReturnType<typeof backendIdentity>) => {
        identities.push(identity);
        if (plan.delivery && JSON.stringify(identity) !== JSON.stringify(plan.delivery.backend)) identityProblem = true;
      };
      const completionObserved = (question: string, raw: any) => observations.push({ question, promptTokens: metric(raw.tokens_evaluated), predictedTokens: metric(raw.tokens_predicted),
        promptProcessingMs: metric(raw.timings?.prompt_ms), cacheTokens: metric(raw.tokens_cached ?? raw.timings?.cache_n) });
      const start = performance.now();
      let assessment: Assessment | null = null, failure: string | null = null, started = false, elapsedMs: number | null = null;
      let gates: ReturnType<typeof assessmentDecision> | null = null;
      if (!stopped && !controller.signal.aborted) {
        started = true;
        const budget = assessmentBudget(plan.bounds.assessmentMs, controller.signal);
        const deadline: ComparisonDeadline = Object.freeze({ signal: budget.signal, checkDeadline: budget.check, remainingMs: budget.remaining });
        let observerEnded = false, observerStage: 'start' | 'end' | null = null;
        const countedFetch: typeof fetch = async (url, init) => {
          if (identityProblem) throw new NativeFailure('comparison-runtime-identity');
          if (requests >= 38 || pairRequests >= 76) throw new NativeFailure('comparison-request-bound');
          requests++; pairRequests++;
          if (new URL(String(url)).pathname === '/completion') startedPrompts++;
          return fetcher!(url, init);
        };
        const recording: RecordingSink = (stage, data) => {
          const value = data.value as any;
          if (stage === 'response' && value?.kind === 'metadata') metadataObserved(value.identity);
          if (stage === 'response' && value?.kind === 'native-response') completionObserved(value.question, value.raw);
          if (stage === 'response' && value?.kind === 'scope-submission' && value.status === 'completed') completedPrompts++;
        };
        try {
          budget.check();
          if (options.observer) {
            observerStage = 'start';
            await budget.bounded(() => Promise.resolve(options.observer!.start(Object.freeze({ side: name, deadline }))));
            observerStage = null;
          }
          const prepared = name === 'baseline' ? boundHistoricalEvidence(side.request) : boundEvidence(side.request);
          if (!prepared) throw new JudgeFailure('insufficient-evidence');
          if (JSON.stringify(name === 'baseline' ? judgeState(prepared) : prepared.judgeScopes) !==
            JSON.stringify(name === 'baseline' ? judgeState(side.request) : side.request.judgeScopes)) throw new NativeFailure('comparison-payload-drift');
          const raw = name === 'baseline' ? await baselineAssessment(plan, countedFetch, budget.signal, () => completedPrompts++, metadataObserved, completionObserved)
            : await createApusJudge({ baseUrl: plan.delivery?.baseUrl ?? 'http://127.0.0.1:8088', model: plan.model, fetch: countedFetch })(prepared, budget.signal, recording);
          if (identityProblem) throw new NativeFailure('comparison-runtime-identity');
          assessment = validateAssessment(raw, side.request.policy, side.request);
          gates = assessmentDecision(assessment, plan.config, side.request.policy);
          budget.check();
          if (options.observer) {
            observerEnded = true;
            observerStage = 'end';
            await budget.bounded(() => Promise.resolve(options.observer!.end(Object.freeze({ side: name, status: 'complete', failure: null, deadline }))));
            observerStage = null;
          }
          if (options.observer) budget.check();
        } catch (error) {
          if (options.observer) { try { budget.check(); } catch (deadlineError) { error = deadlineError; } }
          assessment = null; gates = null;
          failure = error instanceof NativeFailure ? `${error.reason}:${error.category}` : error instanceof JudgeFailure ? error.reason
            : observerStage ? `observer-${observerStage}-failed` : 'provider-error'; stopped = true;
          if (options.observer && !observerEnded) {
            // Failed work cannot reuse an aborted assessment signal for bounded cleanup.
            const cleanup = assessmentBudget(10000, new AbortController().signal);
            const deadline = Object.freeze({ signal: cleanup.signal, checkDeadline: cleanup.check, remainingMs: cleanup.remaining });
            try {
              await cleanup.bounded(() => Promise.resolve(options.observer!.end(Object.freeze({ side: name, status: 'failed', failure, deadline }))));
            } catch { failure += ':observer-cleanup-failed'; } finally { cleanup.close(); }
          }
        } finally { budget.close(); }
      }
      if (started) elapsedMs = performance.now() - start;
      const labels = assessment?.rules.map(r => ({ ruleId: r.ruleId, outcome: r.outcome, evidence: r.evidence,
        ...(r.factReferences ? { factReferences: r.factReferences, applicabilitySupported: r.applicabilitySupported } : {}) })) ?? null;
      const matches = assessment ? assessment.rules.every(r => r.outcome.choice === 'PASS' && r.evidence?.choice === 'SUFFICIENT') && gates?.decision === 'ALLOW' : null;
      const total = (field: 'promptTokens' | 'predictedTokens' | 'promptProcessingMs' | 'cacheTokens') =>
        assessment && observations.length === 4 && observations.every(o => o[field] !== null) ? observations.reduce((n, o) => n + o[field]!, 0) : null;
      rows.push({ side: name, questionVersion: side.questionVersion, inputVersion: side.inputVersion, nativeCaptureVersion: side.nativeCaptureVersion,
        evidenceContext: side.evidenceContext, sizes: side.sizes, status: assessment ? 'complete' : started ? 'failed' : 'unstarted', failure,
        fullLatencyMs: assessment ? elapsedMs : null, failedElapsedMs: failure ? elapsedMs : null, latencyKind: !started ? null : scripted ? 'measured-scripted-transport-not-live' : 'live',
        httpRequests: requests, prompts: { planned: 4, started: startedPrompts, complete: completedPrompts, failed: startedPrompts - completedPrompts, unstarted: 4 - startedPrompts },
        tokens: started ? { source: 'raw-native-response-not-assessment', kind: scripted ? 'scripted-not-tokenizer-evidence' : 'actual-provider-fields', observations,
          completeResponseTotals: { promptTokens: total('promptTokens'), predictedTokens: total('predictedTokens'), promptProcessingMs: total('promptProcessingMs'), cacheTokens: total('cacheTokens') } } : null,
        deterministicFacts: assessment ? { choice: 'NONE', probabilities: { NONE: 1 }, modelConfidence: false, authenticatedCoverage: false, nativeScoringRequests: 0 } : null,
        identities: identities.length ? identities : null, returnedModel: assessment?.model ?? null, labels, pureGates: gates, expectedAgreement: matches });
    }
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
  const complete = rows.filter(r => r.status === 'complete').length, started = rows.filter(r => r.status !== 'unstarted').length;
  return { reportVersion: 1, planSha256: plan.planSha256, mode: scripted ? 'scripted-offline' : fetcher ? 'approved-live' : 'approval-denied',
    execution: 'not-executed', enforcementPermission: 'not-granted', counts: { planned: 2, started, complete, failed: started - complete, unstarted: 2 - started },
    httpRequests: pairRequests, agreement: { matches: rows.filter(r => r.expectedAgreement === true).length, denominator: complete }, rows,
    limits: 'Bytes are exact. Scripted scores/tokens/latency do not prove live speed, accuracy, calibration, safety, hooks or execution.' };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--offline' || !args[1]?.startsWith('--output=')) throw new Error('Use --offline --output=/absolute/new-report.json. No live CLI is provided.');
  const output = args[1].slice('--output='.length);
  if (!output.startsWith('/')) throw new Error('absolute-output-required');
  const plan = comparisonPlan(), script = scriptedNative();
  const report = await runComparison(plan, { scriptedFetch: script.fetch });
  writeFileSync(output, JSON.stringify({ plan, sizeCases: readSizeCases(), report }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`Saved scripted offline comparison: ${output}`);
}
