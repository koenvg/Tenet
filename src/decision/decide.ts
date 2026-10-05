import { choiceIssue, probability, validationIssue } from './response-validation.js';
import { performance } from 'node:perf_hooks';
import { JudgeFailure, type Assessment, type Action, type Clock, type Config, type Decision, type Judge, type Policy, type PolicySet, type Reason, type RuleAssessment } from './contracts.js';
import { INTEGRITY_ID } from './policy.js';
import { blockingDiagnostics } from './diagnostics.js';
import { boundEvidence } from './judge-evidence.js';
import type { Trajectory, EvidenceLimits } from './contracts.js';
import type { RecordingSink } from '../recording/contract.js';
import { ASSESSMENT_METADATA, ASSESSMENT_PROFILE, supportsExemption } from './assessment-contract.js';
import type { JudgeRequest } from './contracts.js';
import { evidenceContext, UNAVAILABLE_EVIDENCE_CONTEXT } from './evidence-context.js';
import { assessmentShapeIssue } from './assessment-shape.js';
import type { RequestedJudgeIdentity } from './contracts.js';

export { QUESTION_VERSION } from './assessment-contract.js';
export { MODEL } from './typesafe-contract.js';
export const DEFAULTS: Readonly<Config> = Object.freeze({ effectThreshold: 0.90, evidenceThreshold: 0.90, deadlineMs: 2500 });
const clockDefault: Clock = {
  now: () => performance.now(),
  schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); },
};
export function validConfig(config: Config): boolean {
  return [config.effectThreshold, config.evidenceThreshold].every(p => Number.isFinite(p) && p >= 0 && p <= 1)
    && Number.isFinite(config.deadlineMs) && config.deadlineMs > 0 && config.deadlineMs <= 2_147_483_647;
}
export { probability } from './response-validation.js';
export function validChoice(value: unknown, labels: string[]): boolean { return !choiceIssue(value, labels); }
export function requireChoice(value: unknown, labels: string[]): void {
  const issue = choiceIssue(value, labels);
  if (issue) throw new JudgeFailure('invalid-response', issue);
}
export function validateAssessment(value: unknown, policy: PolicySet, request?: JudgeRequest): Assessment {
  const expected = [...policy.rules.map(r => r.id), INTEGRITY_ID];
  const issue = assessmentShapeIssue(value, policy.rules.map(r => r.id), INTEGRITY_ID);
  if (issue) throw new JudgeFailure('invalid-response', issue === 'response-shape' ? undefined : issue);
  const assessment = value as Assessment;
  const byId = new Map<string, RuleAssessment>();
  for (const r of assessment.rules) {
    const refs = r.outcome.choice === 'NOT_APPLICABLE' ? { digest: r.factReferences!.digest, operationIds: [...r.factReferences!.operationIds] } : undefined;
    byId.set(r.ruleId, { ruleId: r.ruleId,
      outcome: { choice: r.outcome.choice, probabilities: { ...r.outcome.probabilities } },
      evidence: r.evidence === null ? null : { choice: r.evidence.choice, probabilities: { ...r.evidence.probabilities } },
      ...(refs ? { factReferences: refs, applicabilitySupported: supportsExemption(refs, request) } : {}) });
  }
  return { model: assessment.model, rules: expected.map(id => byId.get(id)!), profile: ASSESSMENT_PROFILE };
}

export async function decide(options: {
  policy: Policy; action: Action; cwd: string; judge: Judge; config?: Partial<Config>; clock?: Clock; signal?: AbortSignal;
  trajectory?: Trajectory; evidenceLimits?: EvidenceLimits; recording?: RecordingSink; resolvedAction?: import('../runtime/resolved-action.js').ResolvedAction;
  judgeIdentity?: RequestedJudgeIdentity;
}): Promise<Decision> {
  const { policy, action, cwd, judge, signal } = options;
  const clock = options.clock ?? clockDefault;
  const start = clock.now();
  const config = { ...DEFAULTS, ...options.config };
  let context = UNAVAILABLE_EVIDENCE_CONTEXT;
  const result = (decision: Decision['decision'], reason: Reason, assessment: Assessment | null = null, ruleIds: string[] = [], diagnostics: Decision['diagnostics'] = []): Decision => ({
    decision, reason, assessment, ruleIds, diagnostics, evidenceContext: context, durationMs: Math.max(0, clock.now() - start), config,
    ...ASSESSMENT_METADATA, requestedModel: options.judgeIdentity?.requestedModel ?? null,
    requestedProvider: options.judgeIdentity?.provider ?? 'injected',
  });
  if (!policy.available) return result('BLOCK', policy.reason);
  if (!validConfig(config) || typeof cwd !== 'string' || !cwd.trim()) return result('BLOCK', 'configuration');
  if (policy.rules.some(rule => rule.evidenceThreshold !== undefined && !probability(rule.evidenceThreshold))) return result('BLOCK', 'configuration');
  if (signal?.aborted) return result('BLOCK', 'cancelled');
  if (options.evidenceLimits && (!Number.isSafeInteger(options.evidenceLimits.recentEvents) || options.evidenceLimits.recentEvents < 0
    || !Number.isSafeInteger(options.evidenceLimits.maxBytes) || options.evidenceLimits.maxBytes < 1)) return result('BLOCK', 'configuration');
  context = evidenceContext({ action, resolvedAction: options.resolvedAction });
  const request = boundEvidence({ profile: ASSESSMENT_PROFILE, policy, action, cwd, deadlineMs: config.deadlineMs, trajectory: options.trajectory, resolvedAction: options.resolvedAction }, options.evidenceLimits);
  if (!request) return result('BLOCK', 'insufficient-evidence');
  context = request.evidenceContext!;
  const controller = new AbortController();
  let stopTimer = () => {};
  let cancel = () => {};
  try {
    const interrupted = new Promise<never>((_resolve, reject) => {
      cancel = () => { reject(new JudgeFailure('cancelled')); controller.abort(); };
      signal?.addEventListener('abort', cancel, { once: true });
      stopTimer = clock.schedule(() => { reject(new JudgeFailure('timeout')); controller.abort(); }, config.deadlineMs);
    });
    const raw = await Promise.race([interrupted, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new JudgeFailure(signal?.aborted ? 'cancelled' : 'timeout');
      return judge(request, controller.signal, options.recording);
    })]);
    if (signal?.aborted) return result('BLOCK', 'cancelled');
    if (clock.now() - start >= config.deadlineMs) { controller.abort(); return result('BLOCK', 'timeout'); }
    const assessment = validateAssessment(raw, policy, request);
    const diagnostics = blockingDiagnostics(assessment, config, policy);
    const blocked = diagnostics.filter(r => r.enforcement === 'BLOCK');
    if (blocked.length) {
      const reason = blocked.some(r => r.ruleId === INTEGRITY_ID && r.outcome === 'FAIL') ? 'policy-integrity'
        : blocked.some(r => r.outcome === 'FAIL') ? 'rule-failed' : 'insufficient-evidence';
      return result('BLOCK', reason, assessment, blocked.map(r => r.ruleId), diagnostics);
    }
    const approvals = assessment.rules.filter(r => r.outcome.choice === 'APPROVAL_REQUIRED'
      && policy.rules.find(rule => rule.id === r.ruleId)?.enforcement !== 'WARN').map(r => r.ruleId);
    return approvals.length ? result('ASK', 'rule-approval-required', assessment, approvals, diagnostics)
      : result('ALLOW', diagnostics.length || assessment.rules.some(r => r.outcome.choice === 'APPROVAL_REQUIRED') ? 'advisory-findings' : 'all-rules-pass', assessment, [], diagnostics);
  } catch (error) {
    const failure = result('BLOCK', signal?.aborted ? 'cancelled' : error instanceof JudgeFailure ? error.reason : 'provider-error');
    if (failure.reason === 'invalid-response') failure.validationIssue = validationIssue(error instanceof JudgeFailure ? error.validationIssue : undefined) ?? 'response-shape';
    return failure;
  } finally {
    stopTimer();
    signal?.removeEventListener('abort', cancel);
  }
}
