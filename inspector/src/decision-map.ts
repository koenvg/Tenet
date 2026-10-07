import { confidenceReadings, gateLabels, type RuleView } from './presentation.js';

export interface MapCheck {
  id: string;
  label: string;
  value: string;
  gate: string | null;
  unknown: boolean;
  reading?: { label: string; value: number; threshold: number };
}

// This is a projection of archived diagnostics, never a policy evaluator.
export function mapChecks(rule: RuleView | undefined): MapCheck[] {
  if (!rule) return [{ id: 'missing', label: 'Assessment', value: 'Not recorded', gate: null, unknown: true }];
  const gates = rule.gateIds;
  const outcome = rule.result?.outcome?.choice;
  const checks: MapCheck[] = [{
    id: 'outcome', label: 'Rule outcome', value: typeof outcome === 'string' ? outcome : 'Not recorded',
    gate: gates?.find(g => g === 'rule-fail' || g === 'outcome-unknown') ?? null,
    unknown: !['PASS', 'FAIL', 'APPROVAL_REQUIRED'].includes(outcome ?? '') && !(outcome === 'NOT_APPLICABLE' && rule.evidenceGate === 'not-applicable'),
  }];
  const readings = confidenceReadings(rule);
  for (const gate of gates ?? []) {
    if (gate === 'rule-fail' || gate === 'outcome-unknown') continue;
    const reading = readings.find(r => r.gate === gate);
    checks.push({
      id: gate,
      label: reading?.label ?? (gate === 'evidence-insufficient' ? 'Evidence outcome' : gateLabels[gate] ?? 'Unrecognized check'),
      value: reading ? String(reading.value) : gate === 'evidence-insufficient' ? 'INSUFFICIENT' : 'Recorded gate',
      gate, unknown: !reading && gate !== 'evidence-insufficient',
      ...(reading ? { reading: { label: reading.label, value: reading.value as number, threshold: reading.threshold as number } } : {}),
    });
  }
  if (gates === null) {
    checks.push({ id: 'coverage', label: 'Gate coverage', value: 'Not recorded', gate: null, unknown: true });
  } else if (checks.length === 1 && rule.evidenceGate !== 'not-applicable') {
    const evidence = rule.result?.evidence?.choice;
    checks.push({ id: 'evidence', label: 'Evidence outcome', value: typeof evidence === 'string' ? evidence : 'Not recorded', gate: null, unknown: !evidence });
  }
  return checks;
}

export function checkIcon(check: MapCheck): 'cross' | 'unknown' | 'ask' | 'check' {
  if (check.value === 'FAIL') return 'cross';
  if (check.unknown || check.gate) return 'unknown';
  if (check.value === 'APPROVAL_REQUIRED') return 'ask';
  return ['PASS', 'SUFFICIENT', 'NOT_APPLICABLE'].includes(check.value) ? 'check' : 'unknown';
}

export const checkPosition = (index: number, count: number) => count === 2 ? index === 0 ? 16.5 : 59 : count === 1 ? 36 : 10 + index * 62 / (count - 1);
export const incomingPath = (y: number) => `M 114 410 C 290 410 325 ${y * 10} 471 ${y * 10}`;
export const outgoingPath = (y: number) => `M 529 ${y * 10} C 695 ${y * 10} 715 375 857 375`;
