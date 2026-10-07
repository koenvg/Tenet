import type { ArchiveRecord } from '../recording/contract.js';
import type { InvocationSummary } from './archive-index.js';
import { findingStage, foldFindingStages } from './finding-view.js';
import { noRulesClassifiedViolated } from './assessment-completeness.js';
import type { SummaryCall, SummaryDecision, SummaryRule, SummaryScore } from './summary-model.js';

const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const list = (v: unknown): Record<string, any>[] => Array.isArray(v) ? v.map(object) : [];
export const summaryLabel = (v: unknown) => typeof v === 'string' ? v.length <= 256 ? v : `${v.slice(0, 245)} [omitted]` : 'unknown';
const known = (v: unknown, values: readonly string[], fallback = 'unknown') => typeof v === 'string' && values.includes(v) ? v : fallback;
const probability = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
export const summaryGates = ['rule-fail', 'outcome-unknown', 'outcome-confidence-below-threshold', 'evidence-insufficient',
  'evidence-confidence-below-threshold', 'applicability-unresolved'] as const;
export const summaryChoices = ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED', 'NOT_APPLICABLE', 'SUFFICIENT', 'INSUFFICIENT'] as const;
const score = (v: unknown): SummaryScore | null => {
  const s = object(v);
  if (!summaryChoices.includes(s.choice)) return null;
  const probabilities: Record<string, number> = {};
  for (const key of summaryChoices) {
    const p = probability(object(s.probabilities)[key]);
    if (p !== null) probabilities[key] = p;
  }
  return { choice: s.choice, probabilities };
};

/** Explicit host allowlist. No raw view is constructed or serialized. */
export function projectSummaryCall(row: InvocationSummary): SummaryCall {
  return { id: row.id, callId: summaryLabel(row.callId), toolName: summaryLabel(row.toolName), timestamp: row.timestamp,
    mode: known(row.mode, ['observe', 'enforce']), decision: known(row.decision, ['ALLOW', 'ASK', 'BLOCK']),
    permission: known(row.permission, ['released', 'blocked']), execution: known(row.execution, ['executed', 'failed']),
    categories: [...row.categories], missing: [...row.missing], assessmentStatus: row.evaluatorState.status,
    failure: row.evaluatorState.reason, evaluatorState: { ...row.evaluatorState } };
}

export function projectSummaryDecision(records: ArchiveRecord[], ruleOffset = 0): SummaryDecision {
  if (!Number.isSafeInteger(ruleOffset) || ruleOffset < 0 || ruleOffset % 16 !== 0) throw new Error('invalid-page');
  const stage = (s: string) => object(records.findLast(r => r.stage === s)?.data);
  const begin = stage('begin'), request = stage('request'), decision = stage('decision');
  const findings = foldFindingStages(records.map(findingStage));
  const policy = object(request.policy ?? begin.policy), integrity = object(object(object(request.payload).state).integrity ?? begin.integrity);
  const config = object(stage('assessment').config ?? begin.config);
  const assessment = object(stage('assessment').assessment ?? stage('validation').assessment);
  const rules = [...list(policy.rules), ...(typeof integrity.id === 'string' ? [{ ...integrity, enforcement: 'BLOCK', line: null }] : [])];
  const diagnostics = [...list(decision.contributions), ...list(decision.diagnostics)];
  const valid = findings.evaluatorState.status === 'completed' && stage('validation').valid === true;
  const summaryRules: SummaryRule[] = rules.slice(ruleOffset, ruleOffset + 16).map(rule => {
    const result = valid ? list(assessment.rules).find(r => r.ruleId === rule.id) : undefined;
    const contribution = diagnostics.find(r => r.ruleId === rule.id);
    const text = typeof rule.text === 'string' ? rule.text : 'Rule text unavailable';
    return { id: summaryLabel(rule.id), text: text.length <= 2048 ? text : `${text.slice(0, 2038)} [omitted]`,
      line: Number.isSafeInteger(rule.line) && rule.line > 0 ? rule.line : null,
      textStatus: typeof rule.text !== 'string' ? 'missing' : text.length > 2048 ? 'truncated' : 'recorded',
      omittedTextChars: typeof rule.text === 'string' && text.length > 2048 ? text.length - 2038 : 0,
      enforcement: known(rule.enforcement, ['BLOCK', 'WARN']), builtin: rule.id === integrity.id,
      result: result ? { outcome: score(result.outcome), evidence: score(result.evidence) } : null,
      gateIds: valid && Array.isArray(contribution?.gates) ? contribution.gates.filter((g: any) => summaryGates.includes(g)).slice(0, 8) : null,
      contribution: known(contribution?.contribution, ['pass', 'blocking-gates', 'approval-required', 'advisory-gates', 'advisory-approval', 'unavailable', 'not-applicable']),
      thresholds: { effectThreshold: probability(contribution?.effectThreshold ?? config.effectThreshold),
        evidenceThreshold: probability(contribution && Object.hasOwn(contribution, 'evidenceThreshold') ? contribution.evidenceThreshold : config.evidenceThreshold) },
      evidenceGate: known(contribution?.evidenceGate, ['applicable', 'not-applicable', 'unavailable']),
      profile: summaryLabel(contribution?.profile ?? findings.profile) };
  });
  const recordedDecision = known(decision.decision, ['ALLOW', 'ASK', 'BLOCK']);
  const permission = stage('permission');
  return { identity: records[0] ? { callId: summaryLabel(records[0].callId), toolName: summaryLabel(records[0].toolName), mode: records[0].mode } : null,
    metadata: { schemas: [...new Set(records.map(r => r.schemaVersion))], questionVersion: summaryLabel(request.questionVersion ?? begin.questionVersion),
      profile: summaryLabel(findings.profile), policyDigest: typeof policy.digest === 'string' && /^[a-f0-9]{64}$/.test(policy.digest) ? policy.digest : null },
    decision: recordedDecision, reason: findings.evaluatorState.reason ?? known(decision.reason,
      ['rule-fail', 'rules-pass', 'all-rules-pass', 'approval-required', 'outcome-unknown', 'no-policy', 'no-rules', 'confidence-gate'], 'recorded-decision'),
    permission: known(permission.outcome, ['released', 'blocked']), execution: known(stage('execution').outcome, ['executed', 'failed']),
    approval: known(stage('approval').outcome, ['approved', 'denied', 'cancelled', 'unavailable'], recordedDecision === 'ASK'
      ? records[0]?.mode === 'observe' ? 'not requested (observe mode)' : 'unknown' : recordedDecision === 'unknown' ? 'unknown' : 'not required'),
    categories: valid ? findings.categories : findings.categories.filter(c => c !== 'violation'),
    missing: ['begin', 'request', 'response', 'validation', 'assessment', 'decision', 'permission', 'execution'].filter(s => !records.some(r => r.stage === s)),
    assessmentStatus: findings.evaluatorState.status, failure: findings.evaluatorState.reason, evaluatorState: { ...findings.evaluatorState },
    noRulesClassifiedViolated: valid && noRulesClassifiedViolated(policy, integrity, assessment, stage('validation'), findings.profile),
    rules: summaryRules, omittedRules: Math.max(0, rules.length - summaryRules.length),
    missingRuleSnapshots: valid ? list(assessment.rules).filter(result => !rules.some(rule => rule.id === result.ruleId)).length : 0 };
}

export interface LinkedSessionSummary {
  id: string; timestamp: number; started: number; calls: number;
  categoryCounts: Record<'violation' | 'uncertainty' | 'approval' | 'unavailable' | 'pending', number>;
}
export interface ThreadOverview {
  state: 'available' | 'unavailable' | 'unsupported';
  /** Opaque owner-resolved environment/host/archive identity. Never a client selector. */
  readScope?: string;
  coverage: 'unknown' | 'partial' | 'unavailable'; linkedCalls: number; failures: number;
  issues: string[]; sessions: LinkedSessionSummary[]; nextSession: string | null;
  sessionId: string | null; calls: SummaryCall[]; nextCall: string | null;
  selectedId: string | null; selected: SummaryDecision | null;
}
export const emptyOverview = (state: 'unavailable' | 'unsupported' = 'unavailable'): ThreadOverview => ({
  state, coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: state === 'unsupported' ? [] : ['host-or-archive-unavailable'],
  sessions: [], nextSession: null, sessionId: null, calls: [], nextCall: null, selectedId: null, selected: null,
});
export interface OverviewSelection { sessionId?: string; callId?: string; category?: import('../decision/finding-triage.js').FindingCategory;
  sessionCursor?: string; callCursor?: string; ruleCursor?: string }
