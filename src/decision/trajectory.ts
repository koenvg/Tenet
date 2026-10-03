import type { EvidenceLimits, HistoryEvent, Trajectory } from './contracts.js';
import { EVIDENCE_DEFAULTS, HistoryPreparation } from './history-selection.js';
export { EVIDENCE_DEFAULTS, serializedBytes } from './history-selection.js';

/** Host-facing collector. All content preparation and selection live in history-selection. */
export class Observations {
  private preparation: HistoryPreparation;
  constructor(readonly sessionId: string, readonly limits: EvidenceLimits = EVIDENCE_DEFAULTS,
    sensitiveFields: string[] = [], limitations: string[] = []) {
    this.preparation = new HistoryPreparation(sessionId, limits, sensitiveFields, limitations);
  }
  omit(count = 1): void { this.preparation.omit(count); }
  add(origin: string, callId: string | null, toolName: string | null, data: unknown, timestamp: number | null = Date.now()): void {
    this.preparation.add(origin, callId, toolName, data, timestamp);
  }
  addBatch(events: readonly unknown[], priorOmitted = 0, admissionLimited = false): void {
    this.preparation.addBatch(events, priorOmitted, admissionLimited);
  }
  addHistory(history: readonly HistoryEvent[], priorOmitted = 0, admissionLimited = false): void {
    this.preparation.addHistory(history, priorOmitted, admissionLimited);
  }
  snapshot(): Trajectory { return this.preparation.snapshot(); }
}
