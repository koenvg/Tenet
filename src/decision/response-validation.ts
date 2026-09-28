// Diagnostics contain only fixed codes, never provider labels, prose, or values.
export const validationMessages = {
  'response-shape': 'Evaluator response has an invalid shape or incomplete rule set.',
  labels: 'Evaluator response has missing, extra, or unknown labels.',
  'score-range': 'Evaluator scores must be finite numbers between 0 and 1.',
  'unit-sum': 'Evaluator probabilities do not sum to 1 within 0.000001. Precision accommodation is unsupported; scores were not normalized.',
  'selected-choice': 'Evaluator selected choice is not a highest-probability permitted choice.',
} as const;
export type ValidationIssue = keyof typeof validationMessages;
export function validationIssue(value: unknown): ValidationIssue | undefined {
  return typeof value === 'string' && Object.hasOwn(validationMessages, value) ? value as ValidationIssue : undefined;
}
export const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function probability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
export function choiceIssue(value: unknown, labels: string[]): ValidationIssue | undefined {
  if (!object(value) || typeof value.choice !== 'string' || !object(value.probabilities)) return 'response-shape';
  const ps = value.probabilities;
  if (!labels.includes(value.choice) || Object.keys(ps).length !== labels.length || !labels.every(label => Object.hasOwn(ps, label))) return 'labels';
  if (!labels.every(label => probability(ps[label]))) return 'score-range';
  const values = labels.map(label => ps[label] as number);
  if (Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 0.000001) return 'unit-sum';
  if ((ps[value.choice] as number) < Math.max(...values)) return 'selected-choice';
}
