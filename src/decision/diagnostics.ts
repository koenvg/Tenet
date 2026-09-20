import type { Assessment, BlockingGate, Config, RuleDiagnostic } from './contracts.js';

// Call only with validated assessments. The returned gates also drive enforcement.
export function blockingDiagnostics(assessment: Assessment, config: Config): RuleDiagnostic[] {
  return assessment.rules.flatMap(rule => {
    const outcomeProbability = rule.outcome.probabilities[rule.outcome.choice];
    const evidenceProbability = rule.evidence.probabilities.SUFFICIENT;
    const gates: BlockingGate[] = [];
    if (rule.outcome.choice === 'FAIL') gates.push('rule-fail');
    if (rule.outcome.choice === 'UNKNOWN') gates.push('outcome-unknown');
    if (outcomeProbability < config.effectThreshold) gates.push('outcome-confidence-below-threshold');
    if (rule.evidence.choice !== 'SUFFICIENT') gates.push('evidence-insufficient');
    if (evidenceProbability < config.evidenceThreshold) gates.push('evidence-confidence-below-threshold');
    return gates.length ? [{ ruleId: rule.ruleId, gates, outcome: rule.outcome.choice, outcomeProbability,
      evidence: rule.evidence.choice, evidenceProbability, effectThreshold: config.effectThreshold,
      evidenceThreshold: config.evidenceThreshold }] : [];
  });
}
