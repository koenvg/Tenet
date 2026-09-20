import { performance } from 'node:perf_hooks';
import { JudgeFailure, type Assessment, type Action, type Clock, type Config, type Decision, type Judge, type Policy, type PolicySet, type Reason, type RuleAssessment } from './contracts.js';
import { INTEGRITY_ID } from './policy.js';

export const QUESTION_VERSION = 'policy-rules-v1';
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
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function probability(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }
function validChoice(value: unknown, labels: string[]): boolean {
  if (!object(value) || typeof value.choice !== 'string' || !labels.includes(value.choice) || !object(value.probabilities)) return false;
  const ps = value.probabilities;
  if (Object.keys(ps).length !== labels.length || !labels.every(label => probability(ps[label]))) return false;
  const values = labels.map(label => ps[label] as number);
  return Math.abs(values.reduce((a, b) => a + b, 0) - 1) <= 0.000001
    && (ps[value.choice] as number) >= Math.max(...values);
}
export function validateAssessment(value: unknown, policy: PolicySet): Assessment {
  const expected = [...policy.rules.map(r => r.id), INTEGRITY_ID];
  if (!object(value) || typeof value.model !== 'string' || !value.model.trim() || !Array.isArray(value.rules)
      || !policy.rules.length || new Set(expected).size !== expected.length || value.rules.length !== expected.length) throw new JudgeFailure('invalid-response');
  const remaining = new Set(expected);
  const byId = new Map<string, RuleAssessment>();
  for (const rule of value.rules) {
    if (!object(rule) || typeof rule.ruleId !== 'string' || !remaining.delete(rule.ruleId)
        || !validChoice(rule.outcome, ['PASS', 'APPROVAL_REQUIRED', 'FAIL', 'UNKNOWN'])
        || !validChoice(rule.evidence, ['SUFFICIENT', 'INSUFFICIENT'])) throw new JudgeFailure('invalid-response');
    const r = rule as unknown as RuleAssessment;
    if (r.ruleId === INTEGRITY_ID && r.outcome.choice === 'APPROVAL_REQUIRED') throw new JudgeFailure('invalid-response');
    // Copy only contract fields; never propagate provider prose.
    byId.set(r.ruleId, { ruleId: r.ruleId,
      outcome: { choice: r.outcome.choice, probabilities: { ...r.outcome.probabilities } },
      evidence: { choice: r.evidence.choice, probabilities: { ...r.evidence.probabilities } } });
  }
  return { model: value.model, rules: expected.map(id => byId.get(id)!) };
}

export async function decide(options: {
  policy: Policy; action: Action; cwd: string; judge: Judge; config?: Partial<Config>; clock?: Clock; signal?: AbortSignal;
}): Promise<Decision> {
  const { policy, action, cwd, judge, signal } = options;
  const clock = options.clock ?? clockDefault;
  const start = clock.now();
  const config = { ...DEFAULTS, ...options.config };
  const result = (decision: Decision['decision'], reason: Reason, assessment: Assessment | null = null, ruleIds: string[] = []): Decision => ({
    decision, reason, assessment, ruleIds, durationMs: Math.max(0, clock.now() - start), config,
    questionVersion: QUESTION_VERSION, requestedModel: MODEL,
  });
  if (!policy.available) return result('BLOCK', policy.reason);
  if (!validConfig(config) || typeof cwd !== 'string' || !cwd.trim()) return result('BLOCK', 'configuration');
  if (signal?.aborted) return result('BLOCK', 'cancelled');
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
      return judge({ policy, action, cwd, deadlineMs: config.deadlineMs }, controller.signal);
    })]);
    if (signal?.aborted) return result('BLOCK', 'cancelled');
    if (clock.now() - start >= config.deadlineMs) { controller.abort(); return result('BLOCK', 'timeout'); }
    const assessment = validateAssessment(raw, policy);
    const uncertain = (r: RuleAssessment) => r.outcome.choice === 'UNKNOWN'
      || r.outcome.probabilities[r.outcome.choice] < config.effectThreshold
      || r.evidence.choice !== 'SUFFICIENT' || r.evidence.probabilities.SUFFICIENT < config.evidenceThreshold;
    const blocked = assessment.rules.filter(r => r.outcome.choice === 'FAIL' || uncertain(r));
    if (blocked.length) {
      const reason = blocked.some(r => r.ruleId === INTEGRITY_ID && r.outcome.choice === 'FAIL') ? 'policy-integrity'
        : blocked.some(r => r.outcome.choice === 'FAIL') ? 'rule-failed' : 'insufficient-evidence';
      return result('BLOCK', reason, assessment, blocked.map(r => r.ruleId));
    }
    const approvals = assessment.rules.filter(r => r.outcome.choice === 'APPROVAL_REQUIRED').map(r => r.ruleId);
    return approvals.length ? result('ASK', 'rule-approval-required', assessment, approvals) : result('ALLOW', 'all-rules-pass', assessment);
  } catch (error) {
    return result('BLOCK', signal?.aborted ? 'cancelled' : error instanceof JudgeFailure ? error.reason : 'provider-error');
  } finally {
    stopTimer();
    signal?.removeEventListener('abort', cancel);
  }
}
