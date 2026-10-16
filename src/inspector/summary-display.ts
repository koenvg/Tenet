import type { SummaryAction, SummaryRule, SummaryViolations } from './summary-model.js';

export const recordedActionMaxBytes = 4096;
const encoder = new TextEncoder();
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Accept only a call from a version-decoded retained request, never a preview or current action. */
export function summaryAction(call: unknown): SummaryAction | null {
  const args = object(object(call).arguments);
  for (const field of ['command', 'path', 'file_path'] as const) {
    const text = args[field];
    if (typeof text !== 'string' || !text.length) continue;
    if (encoder.encode(text).length <= recordedActionMaxBytes) return { field, text, truncated: false };
    let bytes = 0, end = 0;
    for (const character of text) {
      bytes += encoder.encode(character).length;
      if (bytes > recordedActionMaxBytes) break;
      end += character.length;
    }
    return { field, text: text.slice(0, end), truncated: true };
  }
  return null;
}

export function uncertainGates(gates: unknown): boolean {
  return !Array.isArray(gates) || gates.some(gate => gate !== 'rule-fail');
}

export function reportedViolations(rules: SummaryRule[], valid: boolean, uncertain: boolean, missingFails = 0): SummaryViolations {
  if (!valid) return { assessment: 'unavailable', uncertain: true, items: [], total: 0, missingRuleSnapshots: 0 };
  const failed = rules.filter(rule => rule.result?.outcome?.choice === 'FAIL');
  return { assessment: 'validated', uncertain, total: failed.length + missingFails, missingRuleSnapshots: missingFails,
    items: failed.slice(0, 16).map(rule => ({ id: rule.id, text: rule.text, textStatus: rule.textStatus,
      omittedTextChars: rule.omittedTextChars, enforcement: rule.enforcement,
      uncertain: uncertainGates(rule.gateIds) })) };
}
