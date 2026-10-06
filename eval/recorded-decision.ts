import { TypeSafeClient, type Fetch } from '@typesafe-ai/sdk';
import { JudgeFailure, type Decision } from '../src/decision/contracts.js';
import { assessmentDecision, validateAssessment } from '../src/decision/decide.js';
import { assembleRecordedAssessment } from '../src/decision/assessment-answers.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import { UNAVAILABLE_EVIDENCE_CONTEXT } from '../src/decision/evidence-context.js';
import { responseSnapshot, type RecordingSink } from '../src/recording/contract.js';
import type { Entry, Manifest, RecordedRequest } from './evidence-selection-inputs.js';

export type RecordedJudge = (request: RecordedRequest, signal: AbortSignal, sink?: RecordingSink) => Promise<unknown>;
/** Version-routed historical transport. Never generates current questions or current provenance. */
export function recordedJudge(entry: Entry, options: { apiKey: string; fetch: Fetch }): RecordedJudge {
  const client = new TypeSafeClient({ apiKey: options.apiKey, baseURL: 'https://api.typesafe.ai',
    defaultModel: entry.payload.model, logLevel: 'off', retry: { maxRetries: 0 }, fetch: options.fetch });
  return async (request, signal, sink) => {
    const raw = await client.systemOne(entry.payload as any, { signal, timeout: request.deadlineMs, retry: { maxRetries: 0 } });
    sink?.('response', responseSnapshot(raw));
    const entries = [...request.policy.rules.map(r => r.id), INTEGRITY_ID].map((id, i) => ({ id,
      reference: '', outcomeKey: `rule_${i}_outcome`, evidenceKey: `rule_${i}_evidence`, factsKey: `rule_${i}_facts` }));
    return assembleRecordedAssessment(raw, entry.payload.questions, entries, request.policy, request);
  };
}
/** Report-only scoring of the recorded contract, with its identities and thresholds. */
export async function decideRecorded(entry: Entry, manifest: Manifest, judge: RecordedJudge, signal?: AbortSignal): Promise<Decision> {
  if (manifest.profile !== 'applicability-v1' || manifest.questionVersion !== 'policy-rules-v7-evidence-selection') throw Error('unsupported-recorded-contract');
  const started = performance.now(), controller = new AbortController();
  const cancelled = () => controller.abort('cancelled');
  signal?.addEventListener('abort', cancelled, { once: true });
  if (signal?.aborted) cancelled();
  const timer = setTimeout(() => controller.abort('timeout'), manifest.thresholds.deadlineMs);
  const base = { profile: manifest.profile as 'applicability-v1', questionVersion: manifest.questionVersion, requestedModel: manifest.requestedModel,
    config: manifest.thresholds, evidenceContext: UNAVAILABLE_EVIDENCE_CONTEXT };
  try {
    const interrupted = new Promise<never>((_, reject) => {
      const fail = () => reject(new JudgeFailure(controller.signal.reason === 'timeout' ? 'timeout' : 'cancelled'));
      if (controller.signal.aborted) fail(); else controller.signal.addEventListener('abort', fail, { once: true });
    });
    const raw = await Promise.race([interrupted, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new JudgeFailure('cancelled');
      return judge(entry.request, controller.signal);
    })]);
    const assessment = validateAssessment(raw, entry.request.policy, entry.request);
    return { ...base, ...assessmentDecision(assessment, manifest.thresholds, entry.request.policy), assessment, durationMs: performance.now() - started };
  } catch (error) {
    return { ...base, decision: 'BLOCK', reason: controller.signal.aborted ? controller.signal.reason === 'timeout' ? 'timeout' : 'cancelled'
      : error instanceof JudgeFailure ? error.reason : 'provider-error', assessment: null, diagnostics: [], ruleIds: [],
      ...(error instanceof JudgeFailure && error.reason === 'invalid-response' ? { validationIssue: error.validationIssue ?? 'response-shape' as const } : {}),
      durationMs: performance.now() - started };
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancelled); }
}
