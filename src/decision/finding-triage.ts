// Classification uses recorded facts only. A decision to block is not itself a violation.
export const findingCategories = ['violation', 'uncertainty', 'approval', 'unavailable', 'pending'] as const;
export type FindingCategory = typeof findingCategories[number];
export const categoryLabels: Record<FindingCategory, string> = {
  violation: 'Suspected violation', uncertainty: 'Assessment uncertainty', approval: 'Approval condition',
  unavailable: 'Evaluator unavailable', pending: 'Observation pending or incomplete',
};
export interface FindingFacts {
  assessmentStatus: string;
  reason?: string | null;
  rules: readonly { ruleId: string; outcome?: string; gates: readonly string[] }[];
  approvalRules?: readonly string[];
}
const uncertaintyGates = new Set(['outcome-unknown', 'outcome-confidence-below-threshold',
  'evidence-insufficient', 'evidence-confidence-below-threshold']);
export function uncertaintyKeys(facts: FindingFacts): { ruleId: string; gate: string }[] {
  return facts.rules.flatMap(rule => rule.gates.filter(gate => uncertaintyGates.has(gate))
    .map(gate => ({ ruleId: rule.ruleId, gate })));
}
export function classifyFinding(facts: FindingFacts): FindingCategory[] {
  const rules = facts.rules;
  if (['invalid-response', 'validation-failed'].includes(facts.reason ?? '')) return ['unavailable'];
  return findingCategories.filter(category => {
    switch (category) {
      case 'violation': return rules.some(r => r.outcome === 'FAIL' || r.gates.includes('rule-fail'));
      case 'uncertainty': return uncertaintyKeys(facts).length > 0;
      case 'approval': return !!facts.approvalRules?.length || rules.some(r => r.outcome === 'APPROVAL_REQUIRED');
      case 'unavailable': return facts.assessmentStatus === 'failed' || facts.assessmentStatus === 'unavailable';
      case 'pending': return ['incomplete', 'pending', 'dropped', 'cancelled'].includes(facts.assessmentStatus);
    }
  });
}
