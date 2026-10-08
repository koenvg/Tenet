import type { InvocationView } from '../../src/inspector/view.js';
import { categoryLabels, type FindingCategory } from '../../src/decision/finding-triage.js';
import { primaryStatus as sharedPrimaryStatus, decisionLabel, findingPresentation, explainDecision, type StatusTone } from './presentation.js';
export * from './presentation.js';
type RuleView = InvocationView['rules'][number];

export function primaryStatus(facts: Parameters<typeof sharedPrimaryStatus>[0]) {
  const status = sharedPrimaryStatus(facts);
  return status.label === 'Released' ? { ...status, label: 'Not blocked by Tenet' } : status;
}

function uncertaintyNotice(view: InvocationView): boolean {
  const blockers = view.rules.filter(rule => rule.enforcement === 'BLOCK' && rule.gateIds?.length);
  return view.decision === 'BLOCK' && view.reason === 'insufficient-evidence' && view.noRulesClassifiedViolated
    && blockers.length > 0 && blockers.every(rule => rule.gateIds?.every(gate => ['outcome-unknown', 'outcome-confidence-below-threshold', 'evidence-insufficient', 'evidence-confidence-below-threshold', 'applicability-unresolved'].includes(gate)));
}

export function permissionFact(permission?: string | null) {
  return permission === 'blocked' ? { label: 'Blocked by Tenet', tone: 'danger' as StatusTone }
    : permission === 'released' ? { label: 'Not blocked by Tenet', tone: 'neutral' as StatusTone }
    : { label: 'Unknown', tone: 'caution' as StatusTone };
}
export function resultFact(execution?: string | null) {
  return execution === 'executed' ? { label: 'Successful', tone: 'neutral' as StatusTone }
    : execution === 'failed' ? { label: 'Failed', tone: 'danger' as StatusTone }
    : { label: 'Unknown / not recorded', tone: 'caution' as StatusTone };
}
export function assessmentFact(view: InvocationView) {
  const labels: Record<string, string> = { pending: 'Pending', dropped: 'Dropped', cancelled: 'Cancelled', incomplete: 'Incomplete', unavailable: 'Unavailable', failed: 'Unavailable' };
  const incomplete = !['validated', 'completed'].includes(view.assessmentStatus);
  const unavailable = view.assessmentInvalid || view.failure || view.validationIssue || view.categories.includes('unavailable');
  if (incomplete) {
    const lifecycle = labels[view.assessmentStatus] ?? 'Unknown';
    return unavailable && !['Unavailable'].includes(lifecycle) ? `${lifecycle} · Evaluator unavailable` : lifecycle;
  }
  return unavailable ? 'Unavailable' : decisionLabel(view.decision, view.identity?.mode);
}
export function summaryFindings(view: InvocationView) {
  // Lifecycle categories are named in Assessment, not repeated as a second badge.
  return view.categories.filter(c => c !== 'pending' && c !== 'unavailable');
}
type ListFacts = { mode?: string | null; permission?: string | null; execution?: string | null; categories?: FindingCategory[]; assessmentStatus?: string; failure?: string | null; assessmentInvalid?: boolean; missing?: string[] };
export function displayedContext(calls: readonly ListFacts[]) {
  const ordinary = calls.length > 0 && calls.every(c => ['validated', 'completed'].includes(c.assessmentStatus ?? '')
    && !c.assessmentInvalid && !c.failure && !c.categories?.some(category => ['pending', 'unavailable'].includes(category))
    && !c.missing?.some(stage => stage !== 'execution') && c.permission === 'released'
    && !primaryStatus(c).inconsistency && c.execution !== 'failed');
  const mode = ordinary && ['observe', 'enforce'].includes(calls[0]?.mode ?? '') && calls.every(c => c.mode === calls[0]!.mode) ? calls[0]!.mode : null;
  const permission = ordinary ? 'released' : null;
  // A missing stage proves absence. An unknown or future result value does not.
  const absentResult = ordinary && calls.every(c => c.missing?.includes('execution') && (!c.execution || c.execution === 'unknown'));
  return { mode, permission, absentResult };
}

export function callConcern(facts: { execution?: string | null; permission?: string | null; categories?: FindingCategory[]; missing?: string[]; assessmentStatus?: string; failure?: string | null; assessmentInvalid?: boolean }) {
  const categories = facts.categories ?? [];
  const category = (['violation', 'unavailable', 'approval', 'uncertainty', 'pending'] as FindingCategory[]).find(c => categories.includes(c));
  const finding = category ? findingPresentation(category) : null;
  const conflict = primaryStatus(facts).inconsistency;
  const cues = [conflict ? 'Conflicting records' : '', facts.assessmentInvalid ? 'Assessment invalid' : '',
    finding ? `${finding.label}${categories.length > 1 ? ` +${categories.length - 1}` : ''}` : ''].filter(Boolean);
  const text = cues.join(' · ') || (facts.missing?.some(stage => stage !== 'execution') ? 'Incomplete recording' : facts.failure ? 'Assessment failed' : '');
  if (!text) return null;
  return { text, tone: conflict ? 'danger' : facts.assessmentInvalid ? 'caution' : finding?.tone ?? 'caution', description: categories.map(c => categoryLabels[c]).join(' · ') };
}


export function hasFinding(rule: RuleView) {
  return !!rule.gateIds?.length || ['approval-required', 'advisory-approval'].includes(rule.contribution)
    || ['FAIL', 'APPROVAL_REQUIRED'].includes(rule.result?.outcome?.choice ?? '');
}
export function orderedRules(rules: RuleView[]) {
  const rank = (rule: RuleView) => hasFinding(rule) ? rule.enforcement === 'BLOCK' ? 0 : 1 : rule.result ? 3 : 2;
  return [...rules].sort((a, b) => rank(a) - rank(b));
}

export function decisionReason(view: InvocationView): string {
  if (view.assessmentInvalid || view.failure || view.validationIssue || !['validated', 'completed'].includes(view.assessmentStatus)) {
    const reason = view.failure ?? view.validationIssue ?? (view.assessmentInvalid ? 'recorded validation rejected the assessment' : view.reason);
    const reasons: Record<string, string> = { 'not-started': 'The recorded assessment had not started.', 'queue-capacity': 'The assessment queue was full.', 'session-shutdown': 'The session ended before assessment completed.', 'provider-error': 'The evaluator request failed.', 'invalid-response': 'The recorded evaluator response was invalid.', timeout: 'The evaluator did not finish before the deadline.' };
    return reason && reason !== 'unavailable' ? reasons[reason] ?? `Recorded reason: ${reason}.`
      : 'No completed, valid assessment is available. Missing data is not a pass.';
  }
  const uncertainty = uncertaintyNotice(view);
  const blocker = orderedRules(view.rules).find(r => r.enforcement === 'BLOCK' && r.gateIds?.length);
  if (view.decision === 'BLOCK' && blocker) {
    const reasons: Record<string, string> = {
      'rule-fail': blocker.builtin ? 'The built-in integrity check reported a violation.' : 'A policy rule was reported as violated.',
      'outcome-unknown': 'TENET could not determine whether the action follows a policy rule.',
      'outcome-confidence-below-threshold': 'Confidence in a rule outcome was below the required threshold.',
      'evidence-insufficient': 'There was not enough evidence to assess a policy rule.',
      'evidence-confidence-below-threshold': 'Evidence confidence was below the required threshold.',
    };
    const reason = reasons[blocker.gateIds![0]!] ?? explainDecision(view);
    return uncertainty ? `${reason} No rule was classified as violated.` : reason;
  }
  if (view.decision === 'ASK') return 'An approval condition was recorded.';
  if (view.decision === 'ALLOW') return view.reason === 'all-rules-pass'
    ? 'No blocking issues or approval requirements were recorded.'
    : explainDecision(view);
  return explainDecision(view);
}
