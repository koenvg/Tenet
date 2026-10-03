import type { ValidationIssue } from './response-validation.js';
import { choiceIssue, object } from './response-validation.js';

export const ASSESSMENT_PROFILE = 'applicability-v1';
export const QUESTION_VERSION = 'policy-rules-v7-evidence-selection';
export type AssessmentProfile = typeof ASSESSMENT_PROFILE;
export const ASSESSMENT_METADATA = Object.freeze({ profile: ASSESSMENT_PROFILE, questionVersion: QUESTION_VERSION });
export type AssessmentMetadata = typeof ASSESSMENT_METADATA;

/** Browser-safe structural contract check. No authentication, gates or permission calculation. */
export function assessmentShapeIssue(value: unknown, policyRuleIds: readonly unknown[], integrityId: string,
  profile: string = ASSESSMENT_PROFILE): ValidationIssue | undefined {
  const expected = [...policyRuleIds, integrityId];
  if (!['legacy', ASSESSMENT_PROFILE].includes(profile) || !object(value)
    || typeof value.model !== 'string' || !value.model.trim() || !Array.isArray(value.rules)
    || (value.profile !== undefined && value.profile !== profile) || !policyRuleIds.length
    || expected.some(id => typeof id !== 'string') || new Set(expected).size !== expected.length
    || value.rules.length !== expected.length) return 'response-shape';
  const remaining = new Set(expected);
  for (const rule of value.rules) {
    if (!object(rule) || typeof rule.ruleId !== 'string' || !remaining.delete(rule.ruleId)) return 'response-shape';
    const outcomeIssue = choiceIssue(rule.outcome, ['PASS', 'APPROVAL_REQUIRED', 'FAIL', 'UNKNOWN',
      ...(profile === ASSESSMENT_PROFILE && rule.ruleId !== integrityId ? ['NOT_APPLICABLE'] : [])]);
    if (outcomeIssue) return outcomeIssue;
    // choiceIssue establishes the choice shape, without rewriting distributions.
    const outcome = (rule.outcome as { choice: string }).choice;
    if (rule.ruleId === integrityId && outcome === 'APPROVAL_REQUIRED') return 'selected-choice';
    if (outcome === 'NOT_APPLICABLE') {
      const refs = rule.factReferences;
      if (rule.evidence !== null || !object(refs) || typeof refs.digest !== 'string' || refs.digest.length > 128
        || !Array.isArray(refs.operationIds) || refs.operationIds.length > 64
        || !refs.operationIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 4096)) return 'response-shape';
    } else {
      const evidenceIssue = choiceIssue(rule.evidence, ['SUFFICIENT', 'INSUFFICIENT']);
      if (evidenceIssue) return evidenceIssue;
      if (rule.factReferences !== undefined) return 'response-shape';
    }
  }
}
