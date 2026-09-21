import type { Decision, PolicySet } from '../decision/contracts.js';

// Capture the decision's existing outputs. Never evaluate probabilities here.
export function ruleContributions(result: Decision, policy: PolicySet) {
  return result.assessment?.rules.map(rule => {
    const diagnostic = result.diagnostics.find(d => d.ruleId === rule.ruleId);
    const enforcement = policy.rules.find(r => r.id === rule.ruleId)?.enforcement ?? 'BLOCK';
    const gates = diagnostic?.gates ?? [];
    const contribution = gates.length ? enforcement === 'WARN' ? 'advisory-gates' : 'blocking-gates'
      : rule.outcome.choice === 'APPROVAL_REQUIRED' ? enforcement === 'WARN' ? 'advisory-approval' : 'approval-required'
      : 'pass';
    return { ruleId: rule.ruleId, enforcement, gates, contribution,
      effectThreshold: result.config.effectThreshold, evidenceThreshold: result.config.evidenceThreshold };
  }) ?? null;
}
