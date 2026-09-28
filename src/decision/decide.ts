import { choiceIssue, object, probability, validationIssue } from './response-validation.js';
import { performance } from 'node:perf_hooks';
import { JudgeFailure, type Assessment, type Action, type Clock, type Config, type Decision, type Judge, type Policy, type PolicySet, type Reason, type RuleAssessment } from './contracts.js';
import { INTEGRITY_ID } from './policy.js';
import { blockingDiagnostics } from './diagnostics.js';
import { boundEvidence } from './judge-evidence.js';
import type { Trajectory, EvidenceLimits } from './contracts.js';
import type { RecordingSink } from '../recording/contract.js';
import { ASSESSMENT_METADATA, ASSESSMENT_PROFILE, supportsExemption } from './assessment-contract.js';
import type { JudgeRequest } from './contracts.js';

export { QUESTION_VERSION } from './assessment-contract.js';
export const MODEL = 'jev-latest';
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
  if (!object(value) || typeof value.model !== 'string' || !value.model.trim() || !Array.isArray(value.rules)
      || (value.profile !== undefined && value.profile !== ASSESSMENT_PROFILE)
      || !policy.rules.length || new Set(expected).size !== expected.length || value.rules.length !== expected.length) throw new JudgeFailure('invalid-response');
  const remaining = new Set(expected);
  const byId = new Map<string, RuleAssessment>();
  for (const rule of value.rules) {
    if (!object(rule) || typeof rule.ruleId !== 'string' || !remaining.delete(rule.ruleId)) throw new JudgeFailure('invalid-response');
    requireChoice(rule.outcome, ['PASS', 'APPROVAL_REQUIRED', 'FAIL', 'UNKNOWN', ...(rule.ruleId !== INTEGRITY_ID ? ['NOT_APPLICABLE'] : [])]);
    const r = rule as unknown as RuleAssessment;
    const notApplicable = r.outcome.choice === 'NOT_APPLICABLE';
    if (r.ruleId === INTEGRITY_ID && r.outcome.choice === 'APPROVAL_REQUIRED') throw new JudgeFailure('invalid-response', 'selected-choice');
    if (notApplicable) {
      const refs = rule.factReferences;
      if (rule.evidence !== null || !object(refs) || typeof refs.digest !== 'string' || refs.digest.length > 128
        || !Array.isArray(refs.operationIds) || refs.operationIds.length > 64
        || !refs.operationIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 4096)) throw new JudgeFailure('invalid-response');
    } else {
      requireChoice(rule.evidence, ['SUFFICIENT', 'INSUFFICIENT']);
      if (rule.factReferences !== undefined) throw new JudgeFailure('invalid-response');
    }
    const refs = notApplicable ? { digest: r.factReferences!.digest, operationIds: [...r.factReferences!.operationIds] } : undefined;
    byId.set(r.ruleId, { ruleId: r.ruleId,
      outcome: { choice: r.outcome.choice, probabilities: { ...r.outcome.probabilities } },
      evidence: r.evidence === null ? null : { choice: r.evidence.choice, probabilities: { ...r.evidence.probabilities } },
      ...(refs ? { factReferences: refs, applicabilitySupported: supportsExemption(refs, request) } : {}) });
  }
  return { model: value.model, rules: expected.map(id => byId.get(id)!), profile: ASSESSMENT_PROFILE };
}

export async function decide(options: {
  policy: Policy; action: Action; cwd: string; judge: Judge; config?: Partial<Config>; clock?: Clock; signal?: AbortSignal;
  trajectory?: Trajectory; evidenceLimits?: EvidenceLimits; recording?: RecordingSink; resolvedAction?: import('../runtime/resolved-action.js').ResolvedAction;
}): Promise<Decision> {
  const { policy, action, cwd, judge, signal } = options;
  const clock = options.clock ?? clockDefault;
  const start = clock.now();
  const config = { ...DEFAULTS, ...options.config };
  const result = (decision: Decision['decision'], reason: Reason, assessment: Assessment | null = null, ruleIds: string[] = [], diagnostics: Decision['diagnostics'] = []): Decision => ({
    decision, reason, assessment, ruleIds, diagnostics, durationMs: Math.max(0, clock.now() - start), config,
    ...ASSESSMENT_METADATA, requestedModel: MODEL,
  });
  if (!policy.available) return result('BLOCK', policy.reason);
  if (!validConfig(config) || typeof cwd !== 'string' || !cwd.trim()) return result('BLOCK', 'configuration');
  if (policy.rules.some(rule => rule.evidenceThreshold !== undefined && !probability(rule.evidenceThreshold))) return result('BLOCK', 'configuration');
  if (signal?.aborted) return result('BLOCK', 'cancelled');
  if (options.evidenceLimits && (!Number.isSafeInteger(options.evidenceLimits.recentEvents) || options.evidenceLimits.recentEvents < 0
    || !Number.isSafeInteger(options.evidenceLimits.maxBytes) || options.evidenceLimits.maxBytes < 1)) return result('BLOCK', 'configuration');
  const request = boundEvidence({ profile: ASSESSMENT_PROFILE, policy, action, cwd, deadlineMs: config.deadlineMs, trajectory: options.trajectory, resolvedAction: options.resolvedAction }, options.evidenceLimits);
  if (!request) return result('BLOCK', 'insufficient-evidence');
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
