import type { EvidenceLimits, Json, Observation, Trajectory } from './contracts.js';
import { captureAction, freeze, jsonCopy } from './evidence.js';

export const EVIDENCE_DEFAULTS: Readonly<EvidenceLimits> = Object.freeze({ recentEvents: 12, maxBytes: 24 * 1024 });
export const serializedBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const marker = (reason: string): Json => ({ tenetOmission: reason });

// Host content blocks are not tool-specific schemas. Never send image bytes as text.
function textEvidence(value: unknown, seen = new Set<object>()): Json {
  if (value === undefined) return marker('metadata-unavailable');
  if (value && typeof value === 'object') {
    if (seen.has(value)) return marker('unsupported-circular-content');
    seen.add(value);
    try {
      if ('type' in value && value.type === 'image') return marker('unsupported-image');
      if (Array.isArray(value)) return value.map(v => textEvidence(v, seen));
      if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return marker('unsupported-content');
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, textEvidence(v, seen)]));
    } finally { seen.delete(value); }
  }
  try { return jsonCopy(value); } catch { return marker('unsupported-content'); }
}

export class Observations {
  private events: Observation[] = [];
  private omitted = 0;
  constructor(readonly sessionId: string, readonly limits: EvidenceLimits = EVIDENCE_DEFAULTS,
    private sensitiveFields: string[] = [], private limitations: string[] = []) {}

  add(origin: string, callId: string | null, toolName: string | null, data: unknown, timestamp: number | null = Date.now()): void {
    const sanitized = captureAction({ sessionId: this.sessionId, callId: callId ?? '', toolName: toolName ?? '',
      arguments: textEvidence(data) }, this.sensitiveFields);
    let payload: Json = { content: sanitized.arguments, redactedFields: sanitized.redactedFields,
      limitations: sanitized.redactedFields ? ['fields-redacted'] : [] };
    if (serializedBytes(payload) > this.limits.maxBytes) payload = marker('observation-byte-limit');
    this.events.push(freeze({ sessionId: this.sessionId, callId, toolName, origin, timestamp, data: payload }));
    while (this.events.length && (this.events.length > this.limits.recentEvents || serializedBytes(this.events) > this.limits.maxBytes)) {
      this.events.shift(); this.omitted++;
    }
  }

  snapshot(): Trajectory {
    return freeze({ observations: [...this.events], omitted: this.omitted,
      limitations: ['untrusted-evidence-not-approval-authority', 'external-state-not-frozen',
        ...this.limitations, ...(this.omitted ? ['history-omitted'] : []),
        ...(this.events.some(e => e.timestamp === null || e.callId === null || e.toolName === null) ? ['metadata-unavailable'] : [])] });
  }
}

// Replay only the selected session branch. Transcript content can supply evidence, never permission.
export function recoverObservations(sessionId: string, entries: readonly unknown[] | undefined,
  limits: EvidenceLimits, sensitiveFields: string[]): Observations {
  const history = new Observations(sessionId, limits, sensitiveFields,
    [entries ? 'recovered-history-untrusted' : 'history-unavailable']);
  for (const raw of entries ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, any>;
    const time = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN;
    const timestamp = Number.isFinite(time) ? time : null;
    if (entry.type === 'custom' && entry.customType === 'tenet') {
      const d = entry.data;
      if (d?.sessionId === sessionId && ['decision', 'approval'].includes(d.stage)) {
        history.add(`recovered-tenet-${d.stage}`, typeof d.callId === 'string' ? d.callId : null,
          typeof d.toolName === 'string' ? d.toolName : null, d, timestamp);
      }
    } else if (entry.type === 'message') {
      const message = entry.message;
      if (message?.role === 'toolResult') history.add('recovered-pi-tool-result', message.toolCallId ?? null,
        message.toolName ?? null, { content: message.content, details: message.details, isError: message.isError }, timestamp);
      if (message?.role === 'assistant' && Array.isArray(message.content)) {
        for (const block of message.content) if (block?.type === 'toolCall') {
          history.add('recovered-pi-tool-call', block.id ?? null, block.name ?? null, block.arguments, timestamp);
        }
      }
    }
  }
  return history;
}
