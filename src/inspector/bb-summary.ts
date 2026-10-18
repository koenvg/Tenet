import type { ArchiveRecord } from '../recording/contract.js';
import type { InvocationSummary } from './archive-index.js';
import { noRulesClassifiedViolated } from './assessment-completeness.js';
import type { SummaryCall, SummaryDecision, SummaryRule, SummaryScore } from './summary-model.js';
import type { Reason } from '../decision/contracts.js';
import { evaluatorFailureCodes } from './finding-view.js';
import { recordedInvocation } from './recorded-invocation.js';
import { summarizeBlockingRules } from './summary-explanation.js';
import { reportedViolations } from './summary-display.js';

import type { SafeThreadRules, ThreadRuleQuery } from './thread-rules-model.js';
import { recordedJudge } from '../recording/native.js';
import { summaryJudge } from './summary-judge.js';
// Keep the BB reason allowlist complete when the decision contract changes.
const decisionReasons = {
  'policy-unavailable': true, 'policy-format': true, 'policy-file-limit': true, 'policy-rule-count-limit': true, 'policy-rule-size-limit': true,
  'all-rules-pass': true, 'advisory-findings': true, 'rule-approval-required': true, 'rule-failed': true, 'policy-integrity': true,
  'insufficient-evidence': true, configuration: true, 'missing-credentials': true, 'invalid-response': true, 'provider-error': true, timeout: true, cancelled: true,
} satisfies Record<Reason, true>;
const safeReasons = [...Object.keys(decisionReasons), ...evaluatorFailureCodes,
  'rule-fail', 'rules-pass', 'approval-required', 'outcome-unknown', 'no-policy', 'no-rules', 'confidence-gate'];

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
  const invocation = recordedInvocation(records);
  const { begin, request, findings, assessment, validation, facts } = invocation;
  const { policy, integrity, rules } = invocation.snapshot;
  const valid = findings.evaluatorState.status === 'completed' && validation.valid === true
    && !records.some(record => ['assessment', 'validation', 'decision', 'assessment-status'].includes(record.stage)
      && (record.data.valid === false || record.data.validationIssue !== undefined));
  const projectRule = ({ rule, builtin, origin }: typeof rules[number]): SummaryRule => {
    const { result: recordedResult, recorded: contribution, thresholds } = invocation.forRule(rule.id);
    const result = valid ? recordedResult : undefined;
    const text = typeof rule.text === 'string' ? rule.text : 'Rule text unavailable';
    return { id: summaryLabel(rule.id), text: text.length <= 2048 ? text : `${text.slice(0, 2038)} [omitted]`,
      line: Number.isSafeInteger(rule.line) && rule.line > 0 ? rule.line : null,
      origin: origin ? { role: origin.role, source: origin.source === null ? null : summaryLabel(origin.source),
        target: origin.target === null ? null : summaryLabel(origin.target), digest: origin.digest === null ? null : summaryLabel(origin.digest),
        line: Number.isSafeInteger(origin.line) && origin.line! > 0 ? origin.line : null } : null,
      textStatus: typeof rule.text !== 'string' ? 'missing' : text.length > 2048 ? 'truncated' : 'recorded',
      omittedTextChars: typeof rule.text === 'string' && text.length > 2048 ? text.length - 2038 : 0,
      enforcement: known(rule.enforcement, ['BLOCK', 'WARN']), builtin,
      result: result ? { outcome: score(result.outcome), evidence: score(result.evidence) } : null,
      gateIds: valid && Array.isArray(contribution?.gates) ? contribution.gates.filter((g: any) => summaryGates.includes(g)).slice(0, 8) : null,
      contribution: known(contribution?.contribution, ['pass', 'blocking-gates', 'approval-required', 'advisory-gates', 'advisory-approval', 'unavailable', 'not-applicable']),
      thresholds: { effectThreshold: probability(thresholds.effectThreshold),
        evidenceThreshold: probability(thresholds.evidenceThreshold) },
      evidenceGate: known(contribution?.evidenceGate, ['applicable', 'not-applicable', 'unavailable']),
      profile: summaryLabel(contribution?.profile ?? findings.profile) };
  };
  const allRules = rules.map(projectRule);
  const submittedRules = invocation.submittedSnapshot.rules;
  const reportedRules = submittedRules.map(projectRule).map((rule, index) => invocation.forRule(submittedRules[index]!.rule.id).hasRecordedGates
    ? rule : { ...rule, gateIds: null });
  const summaryRules = allRules.slice(ruleOffset, ruleOffset + 16);
  return { identity: records[0] ? { callId: summaryLabel(records[0].callId), toolName: summaryLabel(records[0].toolName), mode: records[0].mode } : null,
    recordedAction: invocation.recordedAction,
    reportedViolations: reportedViolations(reportedRules, valid, invocation.assessmentUncertain,
      list(assessment.rules).filter(result => result.outcome?.choice === 'FAIL' && !submittedRules.some(({ rule }) => rule.id === result.ruleId)).length),
    judge: summaryJudge(recordedJudge(records), findings.evaluatorState),
    metadata: { schemas: [...new Set(records.map(r => r.schemaVersion))], questionVersion: summaryLabel(request.questionVersion ?? begin.questionVersion),
      profile: summaryLabel(findings.profile), policyDigest: typeof (policy.combinedDigest ?? policy.digest) === 'string' && /^[a-f0-9]{64}$/.test(policy.combinedDigest ?? policy.digest) ? policy.combinedDigest ?? policy.digest : null },
    decision: known(facts.decision, ['ALLOW', 'ASK', 'BLOCK']),
    reason: known(facts.reason, safeReasons, findings.evaluatorState.reason ?? 'recorded-decision'),
    permission: known(facts.permission, ['released', 'blocked']), execution: known(facts.execution, ['executed', 'failed']),
    approval: known(facts.approval, ['approved', 'denied', 'cancelled', 'unavailable', 'not requested (observe mode)', 'unavailable (host cannot approve)', 'not required']),
    categories: valid ? findings.categories : findings.categories.filter(c => c !== 'violation'),
    missing: invocation.missing,
    assessmentStatus: findings.evaluatorState.status, failure: findings.evaluatorState.reason, evaluatorState: { ...findings.evaluatorState },
    noRulesClassifiedViolated: valid && noRulesClassifiedViolated(policy, integrity, assessment, validation, findings.profile),
    explanation: summarizeBlockingRules(allRules),
    rules: summaryRules, omittedRules: Math.max(0, rules.length - summaryRules.length),
    missingRuleSnapshots: valid ? list(assessment.rules).filter(result => !rules.some(({ rule }) => rule.id === result.ruleId)).length : 0 };
}

export interface LinkedSessionSummary {
  id: string; timestamp: number; started: number; calls: number;
  categoryCounts: Record<'violation' | 'uncertainty' | 'approval' | 'unavailable' | 'pending', number>;
}
export interface ThreadOverview {
  state: 'available' | 'unavailable' | 'unsupported';
  /** Opaque owner-resolved environment/host/archive identity. Never a client selector. */
  readScope?: string;
  revision?: string;
  threadRules?: SafeThreadRules | null;
  coverage: 'unknown' | 'partial' | 'unavailable'; linkedCalls: number; failures: number;
  issues: string[]; sessions: LinkedSessionSummary[]; nextSession: string | null;
  sessionId: string | null; calls: SummaryCall[]; nextCall: string | null;
  selectedId: string | null; selected: SummaryDecision | null;
}
export const emptyOverview = (state: 'unavailable' | 'unsupported' = 'unavailable'): ThreadOverview => ({
  state, coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: state === 'unsupported' ? [] : ['host-or-archive-unavailable'],
  sessions: [], nextSession: null, sessionId: null, calls: [], nextCall: null, selectedId: null, selected: null,
});
export interface OverviewSelection { query?: ThreadRuleQuery; sessionId?: string; callId?: string; category?: import('../decision/finding-triage.js').FindingCategory;
  sessionCursor?: string; callCursor?: string; ruleCursor?: string }
