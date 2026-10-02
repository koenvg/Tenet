import type { EvidenceLimits, HistoryEvent, Json, JudgeRequest, Observation, Trajectory } from './contracts.js';
import { captureAction, freeze, jsonCopy } from './evidence.js';
import { evidenceWithinBudget } from './evidence-budget.js';

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

/** FIFO selection shared by retained history and the exact submitted-state budget.
 * The caller supplies byte accounting, not a competing event-selection rule.
 */
function selectHistory(source: readonly Observation[], recentEvents: number,
  fits: (observations: Observation[], omitted: number) => boolean) {
  const observations = [...source];
  let omitted = 0;
  while (observations.length > recentEvents) { observations.shift(); omitted++; }
  let enough = fits(observations, omitted);
  while (!enough && observations.length) {
    observations.shift(); omitted++; enough = fits(observations, omitted);
  }
  return { observations, omitted, enough };
}

/** Owns normalization, SDK admission, retention and immutable history snapshots. */
export class HistoryPreparation {
  private events: Observation[] = [];
  private omitted = 0;
  constructor(readonly sessionId: string, readonly limits: EvidenceLimits = EVIDENCE_DEFAULTS,
    private sensitiveFields: string[] = [], private limitations: string[] = []) {}

  /** Count excluded host entries without inspecting their content. */
  omit(count = 1): void { this.omitted += count; }

  add(origin: string, callId: string | null, toolName: string | null, data: unknown, timestamp: number | null): void {
    const sanitized = captureAction({ sessionId: this.sessionId, callId: callId ?? '', toolName: toolName ?? '',
      arguments: textEvidence(data) }, this.sensitiveFields);
    let payload: Json = { content: sanitized.arguments, redactedFields: sanitized.redactedFields,
      limitations: sanitized.redactedFields ? ['fields-redacted'] : [] };
    if (serializedBytes(payload) > this.limits.maxBytes) payload = marker('observation-byte-limit');
    const event = freeze({ sessionId: this.sessionId, callId, toolName, origin, timestamp, data: payload });
    const selected = selectHistory([...this.events, event], this.limits.recentEvents,
      observations => serializedBytes(observations) <= this.limits.maxBytes);
    this.events = selected.observations;
    this.omitted += selected.omitted;
  }

  addHistory(history: readonly HistoryEvent[]): void {
    // Preserve bounded SDK inspection: never read the excluded prefix or copy oversized raw entries.
    const length = history.length;
    const start = Math.max(0, length - this.limits.recentEvents);
    this.omit(start);
    for (let index = start; index < length; index++) {
      const event = history[index];
      if (!event || !['tool-call', 'tool-result'].includes(event.kind)
        || !evidenceWithinBudget([event], this.limits.maxBytes)) { this.omit(); continue; }
      this.add(`host-${event.kind}`, event.callId, event.toolName, event.data, event.timestamp ?? null);
    }
  }

  snapshot(): Trajectory {
    return freeze({ observations: [...this.events], omitted: this.omitted,
      limitations: ['untrusted-evidence-not-approval-authority', 'external-state-not-frozen',
        ...this.limitations, ...(this.omitted ? ['history-omitted'] : []),
        ...(this.events.some(e => e.timestamp === null || e.callId === null || e.toolName === null) ? ['metadata-unavailable'] : [])] });
  }
}

/** Protect current arguments and resolution. Only optional tool metadata and history can be removed.
 * measureBytes counts the actual judge-state projection, including policy and integrity text.
 */
export function prepareRequest(request: JudgeRequest, measureBytes: (request: JudgeRequest) => number,
  limits: EvidenceLimits = EVIDENCE_DEFAULTS): JudgeRequest | null {
  const source = request.trajectory ?? { observations: [], omitted: 0, limitations: ['history-unavailable'] };
  let action = request.action;
  let bounded: JudgeRequest | null = null;
  const selected = selectHistory(source.observations, limits.recentEvents, (observations, omitted) => {
    const snapshot = () => {
      const trajectory: Trajectory = { observations: [...observations], omitted: source.omitted + omitted,
        limitations: [...source.limitations, ...(omitted ? ['history-omitted'] : [])] };
      return freeze(JSON.parse(JSON.stringify({ ...request, action, trajectory })) as JudgeRequest);
    };
    bounded = snapshot();
    // Optional tool metadata goes before causal history, never before count selection.
    if (measureBytes(bounded) > limits.maxBytes && (action.description !== null || action.parameters !== null)) {
      action = { ...action, description: null, parameters: null, limitations: [...action.limitations, 'tool-metadata-omitted'] };
      bounded = snapshot();
    }
    return measureBytes(bounded) <= limits.maxBytes;
  });
  return selected.enough ? bounded : null;
}
