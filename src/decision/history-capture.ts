import { ownHistoryFields } from './history-envelope.js';

/** Negative coverage reported by an embedding host, never authenticated action facts.
 * Counts refer to known omitted source slots, not missing tool calls or effects. */
export interface HistoryCaptureMetadata {
  readonly priorOmittedEvents: number;
  readonly admissionLimited: boolean;
}

/** Fixed own data fields only. Invalid input cannot silently become complete capture. */
export function captureHistoryMetadata(value: unknown): HistoryCaptureMetadata {
  if (value === undefined) return { priorOmittedEvents: 0, admissionLimited: false };
  const fields = ownHistoryFields(value, ['priorOmittedEvents', 'admissionLimited']);
  if (!fields || !Number.isSafeInteger(fields.priorOmittedEvents) || (fields.priorOmittedEvents as number) < 0
    || typeof fields.admissionLimited !== 'boolean') throw new Error('invalid-history-capture-metadata');
  return { priorOmittedEvents: fields.priorOmittedEvents as number, admissionLimited: fields.admissionLimited };
}

/** Loss counters must never wrap, round upward or become unsafe JSON numbers. */
export function historyCount(...counts: number[]): number {
  let total = 0;
  for (const count of counts) {
    if (!Number.isSafeInteger(count) || count < 0 || count > Number.MAX_SAFE_INTEGER - total) throw new Error('history-count-overflow');
    total += count;
  }
  return total;
}
