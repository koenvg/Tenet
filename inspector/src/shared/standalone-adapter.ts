import type { InvocationView } from '../../../src/inspector/view.js';
import type { InvocationSummary } from '../../../src/inspector/archive-index.js';
import type { SummaryCall, SummaryDecision, SummaryRule, SummaryScore, SummaryEvaluatorState } from './model.js';

const score = (value: unknown): SummaryScore | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as { choice?: unknown; probabilities?: unknown };
  if (typeof source.choice !== 'string') return null;
  const probabilities: Record<string, number> = {};
  if (source.probabilities && typeof source.probabilities === 'object') {
    for (const label of ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED', 'NOT_APPLICABLE', 'SUFFICIENT', 'INSUFFICIENT']) {
      const probability = (source.probabilities as Record<string, unknown>)[label];
      if (typeof probability === 'number' && Number.isFinite(probability)) probabilities[label] = probability;
    }
  }
  return { choice: source.choice, probabilities };
};
export function standaloneRule(rule: InvocationView['rules'][number]): SummaryRule {
  return {
    id: rule.id, text: rule.text, line: typeof rule.line === 'number' ? rule.line : null,
    enforcement: rule.enforcement, builtin: rule.builtin,
    result: rule.result ? { outcome: score(rule.result.outcome), evidence: score(rule.result.evidence) } : null,
    gateIds: rule.gateIds ? [...rule.gateIds] : null, contribution: rule.contribution,
    thresholds: { effectThreshold: typeof rule.thresholds.effectThreshold === 'number' ? rule.thresholds.effectThreshold : null,
      evidenceThreshold: typeof rule.thresholds.evidenceThreshold === 'number' ? rule.thresholds.evidenceThreshold : null },
    evidenceGate: rule.evidenceGate, profile: rule.profile,
  };
}
export function standaloneSummary(view: InvocationView & { evaluatorState?: SummaryEvaluatorState }): SummaryDecision {
  return {
    identity: view.identity ? { callId: view.identity.callId, toolName: view.identity.toolName, mode: view.identity.mode } : null,
    decision: view.decision, reason: view.reason, permission: view.permission, execution: view.execution, approval: view.approval,
    categories: [...view.categories], missing: [...view.missing], assessmentStatus: view.assessmentStatus,
    failure: view.failure, noRulesClassifiedViolated: view.noRulesClassifiedViolated, rules: view.rules.map(standaloneRule),
    ...(view.evaluatorState ? { evaluatorState: { status: view.evaluatorState.status, reason: view.evaluatorState.reason } } : {}),
  };
}
export function standaloneCall(item: InvocationSummary & { evaluatorState?: SummaryEvaluatorState }): SummaryCall {
  return {
    id: item.id, callId: item.callId, toolName: item.toolName, timestamp: item.timestamp, mode: item.mode,
    decision: item.decision, permission: item.permission, execution: item.execution, categories: [...item.categories],
    missing: [...item.missing], assessmentStatus: item.assessmentStatus, failure: item.failure,
    ...(item.evaluatorState ? { evaluatorState: { status: item.evaluatorState.status, reason: item.evaluatorState.reason } } : {}),
  };
}
