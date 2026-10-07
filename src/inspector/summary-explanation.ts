import type { SummaryExplanation, SummaryRule } from './summary-model.js';

// Aggregate recorded blocking gates before pagination. Never reevaluate scores or policy.
export function summarizeBlockingRules(rules: SummaryRule[]): SummaryExplanation {
  const blockers = rules.filter(rule => rule.enforcement === 'BLOCK' && rule.gateIds?.length);
  const first = blockers[0];
  return {
    blockerCount: blockers.length,
    uncertaintyOnly: blockers.length > 0 && blockers.every(rule => rule.gateIds!.every(gate =>
      ['outcome-unknown', 'outcome-confidence-below-threshold', 'evidence-insufficient',
        'evidence-confidence-below-threshold', 'applicability-unresolved'].includes(gate))),
    firstBlocker: first ? {
      builtin: first.builtin, line: first.line, gate: first.gateIds![0]!,
      result: first.result ? { outcome: first.result.outcome ?? null, evidence: first.result.evidence ?? null } : null,
      thresholds: { ...first.thresholds },
    } : null,
  };
}
