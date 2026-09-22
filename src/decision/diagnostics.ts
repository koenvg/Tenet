import type { Assessment, BlockingGate, Config, PolicySet, RuleDiagnostic } from './contracts.js';
import { evidenceThreshold } from './thresholds.js';

// Call only with validated assessments; severity affects consequences, never gates.
export function blockingDiagnostics(assessment: Assessment, config: Config, policy: PolicySet): RuleDiagnostic[] {
  return assessment.rules.flatMap(rule => {
    const outcomeProbability = rule.outcome.probabilities[rule.outcome.choice];
    const evidenceProbability = rule.evidence.probabilities.SUFFICIENT;
    const threshold = evidenceThreshold(rule.ruleId, policy, config);
    const gates: BlockingGate[] = [];
    if (rule.outcome.choice === 'FAIL') gates.push('rule-fail');
    if (rule.outcome.choice === 'UNKNOWN') gates.push('outcome-unknown');
    if (outcomeProbability < config.effectThreshold) gates.push('outcome-confidence-below-threshold');
    if (rule.evidence.choice !== 'SUFFICIENT') gates.push('evidence-insufficient');
    if (evidenceProbability < threshold) gates.push('evidence-confidence-below-threshold');
    return gates.length ? [{ ruleId: rule.ruleId, enforcement: policy.rules.find(r => r.id === rule.ruleId)?.enforcement ?? 'BLOCK',
      gates, outcome: rule.outcome.choice, outcomeProbability,
      evidence: rule.evidence.choice, evidenceProbability, effectThreshold: config.effectThreshold,
      evidenceThreshold: threshold }] : [];
  });
}
