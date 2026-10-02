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
  addHistory(history: readonly HistoryEvent[]): void { this.preparation.addHistory(history); }
  snapshot(): Trajectory { return this.preparation.snapshot(); }
}

// Replay only the selected session branch. Transcript content can supply evidence, never permission.
export function recoverObservations(sessionId: string, entries: readonly unknown[] | undefined,
  limits: EvidenceLimits, sensitiveFields: string[], assessedCalls?: ReadonlySet<string>): Observations {
  const history = new Observations(sessionId, limits, sensitiveFields,
    [entries ? 'recovered-history-untrusted' : 'history-unavailable', ...(assessedCalls ? ['recovery-restricted-to-assessed-calls'] : [])]);
  const eligible = (id: unknown) => !assessedCalls || (typeof id === 'string' && assessedCalls.has(id));
  for (const raw of entries ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, any>;
    const time = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN;
    const timestamp = Number.isFinite(time) ? time : null;
    if (entry.type === 'custom' && entry.customType === 'tenet') {
      const d = entry.data;
      if (d?.mode !== 'observe' && d?.sessionId === sessionId && ['decision', 'approval'].includes(d.stage)) {
        history.add(`recovered-tenet-${d.stage}`, typeof d.callId === 'string' ? d.callId : null,
          typeof d.toolName === 'string' ? d.toolName : null, d, timestamp);
      }
    } else if (entry.type === 'message') {
      const message = entry.message;
      if (message?.role === 'toolResult' && eligible(message.toolCallId)) history.add('recovered-pi-tool-result', message.toolCallId ?? null,
        message.toolName ?? null, { content: message.content, details: message.details, isError: message.isError }, timestamp);
      if (message?.role === 'assistant' && Array.isArray(message.content)) {
        for (const block of message.content) if (block?.type === 'toolCall' && eligible(block.id)) {
          history.add('recovered-pi-tool-call', block.id ?? null, block.name ?? null, block.arguments, timestamp);
        }
      }
    }
  }
  return history;
}
