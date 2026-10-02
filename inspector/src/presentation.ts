import type { InvocationView } from '../../src/inspector/view.js';
export type RuleView = InvocationView['rules'][number];
export type DockTab = 'Evidence' | 'Questions' | 'Response' | 'Policy';
export type MobileView = 'calls' | 'assessment';

export const pretty = (value: unknown) => value == null ? 'Unavailable: not recorded.' : JSON.stringify(value, null, 2);
export const ruleName = (rule: RuleView) => rule.builtin ? 'Built-in integrity' : `Line ${rule.line ?? 'unavailable'}`;
export const gateLabels: Record<string, string> = {
  'rule-fail': 'Reported FAIL',
  'outcome-unknown': 'Outcome unknown',
  'outcome-confidence-below-threshold': 'Low outcome confidence',
  'evidence-insufficient': 'Insufficient evidence',
  'evidence-confidence-below-threshold': 'Low evidence confidence',
  'applicability-unresolved': 'Unsupported non-applicability',
};
export const contributions: Record<string, string> = {
  pass: 'No gate or approval requirement',
  'blocking-gates': 'Contributes blocking gates',
  'advisory-gates': 'Advisory gates only. WARN does not block.',
  'approval-required': 'Requires approval. Another rule may still block the invocation.',
  'advisory-approval': 'Advisory approval requirement. WARN does not request confirmation.',
};
export function gateExplanation(gate: string, rule: RuleView): string {
  const outcome = rule.result?.outcome;
  switch (gate) {
    case 'rule-fail': return 'The evaluator selected FAIL for this rule.';
    case 'outcome-unknown': return 'The evaluator could not determine the rule outcome.';
    case 'outcome-confidence-below-threshold': return `${outcome?.choice ?? 'Outcome unavailable'} selected at ${outcome?.probabilities?.[outcome?.choice] ?? 'unavailable'}; required confidence ${rule.thresholds.effectThreshold ?? 'not recorded'}.`;
    case 'applicability-unresolved': return 'Current authenticated facts do not support an exemption for the entire invocation.';
    case 'evidence-insufficient': return 'The evaluator selected INSUFFICIENT evidence.';
    case 'evidence-confidence-below-threshold': return `SUFFICIENT probability ${rule.result?.evidence?.probabilities?.SUFFICIENT ?? 'unavailable'}; required confidence ${rule.thresholds.evidenceThreshold ?? 'not recorded'}.`;
    default: return `Unrecognized recorded gate: ${gate}`;
  }
}
export function hasFinding(rule: RuleView) {
  return !!rule.gateIds?.length || ['approval-required', 'advisory-approval'].includes(rule.contribution);
}
export function orderedRules(rules: RuleView[]) {
  const rank = (rule: RuleView) => hasFinding(rule) ? rule.enforcement === 'BLOCK' ? 0 : 1 : rule.result ? 3 : 2;
  return [...rules].sort((a, b) => rank(a) - rank(b));
}
// Presentation of recorded outputs only. No threshold comparisons or evaluator imports.
function uncertaintyNotice(view: InvocationView, blockers = view.rules.filter(r => r.enforcement === 'BLOCK' && r.gateIds?.length)): string | null {
  if (view.decision !== 'BLOCK' || view.reason !== 'insufficient-evidence' || !view.noRulesClassifiedViolated || !blockers.length
    || !blockers.every(rule => rule.gateIds?.every(gate => ['outcome-unknown', 'outcome-confidence-below-threshold', 'evidence-insufficient', 'evidence-confidence-below-threshold', 'applicability-unresolved'].includes(gate)))) return null;
  return `No rule was classified as violated. ${view.identity?.mode === 'observe' ? 'The decision would block' : 'The decision is blocked'} by uncertainty. This is not a safety guarantee.`;
}
export function explainDecision(view: InvocationView): string {
  const blockers = orderedRules(view.rules).filter(r => r.enforcement === 'BLOCK' && r.gateIds?.length);
  if (view.decision === 'BLOCK' && blockers.length) {
    const first = blockers[0]!;
    const notice = uncertaintyNotice(view, blockers);
    return `${notice ? notice + ' ' : ''}${ruleName(first)}: ${gateExplanation(first.gateIds![0]!, first)}${blockers.length > 1 ? ` ${blockers.length} rules contribute blocking gates.` : ''}`;
  }
  if (view.decision === 'ASK') return 'Native approval is required by the recorded decision. Permission and execution are shown separately.';
  if (view.decision === 'ALLOW') return view.reason === 'advisory-findings'
    ? 'Advisory findings were recorded. WARN rules did not block this call.'
    : view.reason === 'all-rules-pass' ? 'No blocking gates or approval requirements in the recorded decision.' : `Allowed by the recorded decision. Reason: ${view.reason}.`;
  if (view.decision === 'BLOCK') return `Recorded reason: ${view.reason}. Per-rule blocking details were not recorded.`;
  return 'A decision was not recorded. Missing data is not a pass.';
}
export function tone(value: string) {
  const label = value.toUpperCase();
  if (['PASS', 'ALLOW', 'SUFFICIENT'].includes(label)) return 'positive';
  if (['BLOCK', 'FAIL', 'BLOCKED'].includes(label)) return 'danger';
  if (['ASK', 'APPROVAL_REQUIRED'].includes(label)) return 'approval';
  if (['UNKNOWN', 'WARN', 'INSUFFICIENT', 'UNAVAILABLE'].includes(label)) return 'caution';
  return 'neutral';
}
export const timestamp = (value: number) => Number.isFinite(value) ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Time unavailable';

export const toolLabel = (name: string) => ({ bash: 'Shell command', read: 'Read file', edit: 'Edit file', write: 'Write file' }[name] ?? name);
export const decisionLabel = (decision: string, mode?: string) => {
  const labels: Record<string, string> = mode === 'observe'
    ? { BLOCK: 'Would block', ALLOW: 'Would allow', ASK: 'Would ask for approval' }
    : { BLOCK: 'Block', ALLOW: 'Allow', ASK: 'Approval required' };
  return labels[decision] ?? 'Decision unavailable';
};
export function actionPreview(view: InvocationView): string | null {
  const args = view.evidence?.action?.arguments;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  for (const key of ['command', 'path', 'file_path']) {
    if (typeof args[key] === 'string' && args[key].trim()) return args[key];
  }
  return null;
}
export function decisionReason(view: InvocationView): string {
  const uncertainty = uncertaintyNotice(view);
  if (uncertainty) return uncertainty;
  const blocker = orderedRules(view.rules).find(r => r.enforcement === 'BLOCK' && r.gateIds?.length);
  if (view.decision === 'BLOCK' && blocker) {
    const reasons: Record<string, string> = {
      'rule-fail': 'A policy rule was reported as violated.',
      'outcome-unknown': 'TENET could not determine whether the action follows a policy rule.',
      'outcome-confidence-below-threshold': 'Confidence in a rule outcome was below the required threshold.',
      'evidence-insufficient': 'There was not enough evidence to assess a policy rule.',
      'evidence-confidence-below-threshold': 'Evidence confidence was below the required threshold.',
    };
    return reasons[blocker.gateIds![0]!] ?? explainDecision(view);
  }
  if (view.failure) return `The assessment could not complete. Recorded reason: ${view.failure}.`;
  if (view.decision === 'ASK') return 'The recorded decision requires your approval before proceeding.';
  if (view.decision === 'ALLOW') return view.reason === 'all-rules-pass'
    ? 'No blocking issues or approval requirements were recorded.'
    : explainDecision(view);
  return explainDecision(view);
}
export function executionExplanation(view: InvocationView): string {
  if (view.identity?.mode === 'observe') {
    return view.execution === 'executed'
      ? 'The call ran. Observe mode records decisions without enforcing them.'
      : 'Observe mode records decisions without enforcing them. Execution is shown only when recorded.';
  }
  if (view.execution === 'executed') return 'The call ran. Execution is separate from the policy decision.';
  if (view.execution === 'failed') return 'The tool reported a failure.';
  return 'No execution result was recorded. This does not prove the call ran or was stopped.';
}
export function confidenceReadings(rule: RuleView) {
  const readings = [
    { gate: 'outcome-confidence-below-threshold', label: 'Outcome confidence', value: rule.result?.outcome?.probabilities?.[rule.result?.outcome?.choice], threshold: rule.thresholds.effectThreshold },
    { gate: 'evidence-confidence-below-threshold', label: 'Evidence confidence', value: rule.result?.evidence?.probabilities?.SUFFICIENT, threshold: rule.thresholds.evidenceThreshold },
  ];
  return readings.filter(r => rule.gateIds?.includes(r.gate) && typeof r.value === 'number' && Number.isFinite(r.value) && r.value >= 0 && r.value <= 1 && typeof r.threshold === 'number' && Number.isFinite(r.threshold) && r.threshold >= 0 && r.threshold <= 1);
}
