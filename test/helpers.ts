import type { Assessment, Choice, Outcome, PolicySet, RuleAssessment } from '../src/decision/contracts.js';
import { INTEGRITY_ID, RULE } from '../src/decision/policy.js';
import { fixturePolicy } from '../eval/generic-rule-fixtures.js';

export const policy: PolicySet = fixturePolicy({ rules: [RULE], id: 'mechanics', outcomes: [], integrity: 'PASS', expectedDecision: 'ALLOW', input: { toolName: 'read', arguments: {} } });
export const origin = policy.rules[0]!.origin;
export function outcomeChoice(outcome: Outcome = 'PASS', p = 0.97): Choice<Outcome> {
  const labels: Outcome[] = ['PASS', 'APPROVAL_REQUIRED', 'FAIL', 'UNKNOWN'];
  return { choice: outcome, probabilities: Object.fromEntries(labels.map(e => [e, e === outcome ? p : (1 - p) / 3])) as Record<Outcome, number> };
}
export function ruleAnswer(ruleId: string, outcome: Outcome = 'PASS', p = 0.97): RuleAssessment & { evidence: NonNullable<RuleAssessment['evidence']> } {
  const selected = outcomeChoice(outcome, p);
  return { ruleId, outcome: { ...selected, probabilities: { ...selected.probabilities, ...(ruleId === INTEGRITY_ID ? {} : { NOT_APPLICABLE: 0 }) } },
    evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 0.99, INSUFFICIENT: 0.01 } } };
}
export function answer(selected: PolicySet = policy, outcome: Outcome = 'PASS', p = 0.97): Assessment & { rules: ReturnType<typeof ruleAnswer>[] } {
  return { profile: 'applicability-v1', model: 'jev-offline', rules: [...selected.rules.map(rule => ruleAnswer(rule.id, outcome, p)), ruleAnswer(INTEGRITY_ID)] };
}

/** Scripted SDK response for ordinary outcomes without resolved action facts. */
export function sdkAnswers(assessment: Assessment, confidence = 1): Record<string, any> {
  return Object.fromEntries(assessment.rules.flatMap((rule, i) => [
    [`rule_${i}_outcome`, { type: 'choice', ...rule.outcome, confidence }],
    [`rule_${i}_evidence`, { type: 'choice', ...rule.evidence, confidence }],
    ...(rule.ruleId === INTEGRITY_ID ? [] : [[`rule_${i}_facts`, { type: 'choice', choice: 'NONE', probabilities: { NONE: 1 }, confidence }]]),
  ]));
}
