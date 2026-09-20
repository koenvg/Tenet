import type { Assessment, Choice, Outcome, PolicySet, RuleAssessment } from '../src/decision/contracts.js';
import { INTEGRITY_ID, RULE } from '../src/decision/policy.js';

export const policy: PolicySet = Object.freeze({ available: true, source: '/policy', target: '/policy', digest: 'test-digest',
  rules: Object.freeze([Object.freeze({ id: 'test-digest:1', line: 1, text: RULE })]) });
export function outcomeChoice(outcome: Outcome = 'PASS', p = 0.97): Choice<Outcome> {
  const labels: Outcome[] = ['PASS', 'APPROVAL_REQUIRED', 'FAIL', 'UNKNOWN'];
  return { choice: outcome, probabilities: Object.fromEntries(labels.map(e => [e, e === outcome ? p : (1 - p) / 3])) as Record<Outcome, number> };
}
export function ruleAnswer(ruleId: string, outcome: Outcome = 'PASS', p = 0.97): RuleAssessment {
  return { ruleId, outcome: outcomeChoice(outcome, p), evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 0.99, INSUFFICIENT: 0.01 } } };
}
export function answer(selected: PolicySet = policy, outcome: Outcome = 'PASS', p = 0.97): Assessment {
  return { model: 'jev-offline', rules: [...selected.rules.map(rule => ruleAnswer(rule.id, outcome, p)), ruleAnswer(INTEGRITY_ID)] };
}
