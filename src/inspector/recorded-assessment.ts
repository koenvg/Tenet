export interface RecordedAssessment {
  model: string;
  rules: { ruleId: string; outcome: { choice: string; probabilities?: Record<string, unknown> } }[];
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Diagnostic shape shared by archive metadata and fresh BB detail, not runtime validation.
 * Schemas 1/2 remain unlinked to BB. Schemas 3/4/5 keep their recorded scores and evidence:
 * no current probability, evidence or profile contract is imposed on historical payloads.
 * Inspect every result before applying display/cache caps, including non-FAIL duplicates. */
export function recordedAssessment(value: unknown): RecordedAssessment | null {
  if (!object(value) || typeof value.model !== 'string' || !value.model.trim() || !Array.isArray(value.rules)) return null;
  const ids = new Set<string>();
  for (const rule of value.rules) {
    if (!object(rule) || typeof rule.ruleId !== 'string' || !rule.ruleId.length || rule.ruleId.length > 256
      || ids.has(rule.ruleId) || !object(rule.outcome)
      || !['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED', 'NOT_APPLICABLE'].includes(rule.outcome.choice as string)) return null;
    ids.add(rule.ruleId);
  }
  return value as unknown as RecordedAssessment;
}
