import type { InvocationView } from '../../src/inspector/view.js';
export type RuleView = InvocationView['rules'][number];
export type DockTab = 'Evidence' | 'Questions' | 'Response' | 'Policy';
export type MobileView = 'calls' | 'assessment' | 'evidence';

export const pretty = (value: unknown) => value == null ? 'Unavailable: not recorded.' : JSON.stringify(value, null, 2);
export const ruleName = (rule: RuleView) => rule.builtin ? 'Built-in integrity' : `Line ${rule.line ?? 'unavailable'}`;
export const gateLabels: Record<string, string> = {
  'rule-fail': 'Reported FAIL',
  'outcome-unknown': 'Outcome unknown',
  'outcome-confidence-below-threshold': 'Low outcome confidence',
  'evidence-insufficient': 'Insufficient evidence',
  'evidence-confidence-below-threshold': 'Low evidence confidence',
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
export function explainDecision(view: InvocationView): string {
  const blockers = orderedRules(view.rules).filter(r => r.enforcement === 'BLOCK' && r.gateIds?.length);
  if (view.decision === 'BLOCK' && blockers.length) {
    const first = blockers[0]!;
    return `${ruleName(first)}: ${gateExplanation(first.gateIds![0]!, first)}${blockers.length > 1 ? ` ${blockers.length} rules contribute blocking gates.` : ''}`;
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
