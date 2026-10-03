import { assessmentShapeIssue } from '../decision/assessment-shape.js';

/** Check recorded completeness only. Never recalculate gates, thresholds or permission. */
export function noRulesClassifiedViolated(policy: Record<string, any>, integrity: Record<string, any>,
  assessment: Record<string, any>, validation: Record<string, any>, profile: string): boolean {
  // Historical display labels are not assessment-contract identities.
  const contract = profile === 'legacy (historical)' ? 'legacy' : profile;
  if (validation.valid !== true || !Array.isArray(policy.rules) || typeof integrity.id !== 'string'
    || assessmentShapeIssue(assessment, policy.rules.map(r => r?.id), integrity.id, contract)) return false;
  return !assessment.rules.some((rule: { outcome: { choice: string } }) => rule.outcome.choice === 'FAIL');
}
