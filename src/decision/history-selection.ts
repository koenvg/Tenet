import type { EvidenceLimits, HistoryEvent, HistorySelection, JudgeRequest, Observation, Trajectory } from './contracts.js';
import { freeze } from './evidence.js';
import { prepareContent, type HistoryContent } from './history-content.js';
import { captureObservation, historySlot, ownHistoryFields, type ObservationEnvelope } from './history-envelope.js';

export const EVIDENCE_DEFAULTS: Readonly<EvidenceLimits> = Object.freeze({ recentEvents: 12, maxBytes: 24 * 1024 });
export const serializedBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
// Runtime provenance never comes from authored marker-shaped values or selector counters.
const contents = new WeakMap<Observation, HistoryContent>();
const selections = new WeakMap<Trajectory, HistorySelection>();
export const observationLimitations = (event: Observation): readonly string[] => contents.get(event)?.gaps ?? [];

function captureEvent(event: ObservationEnvelope, content: HistoryContent): Observation {
  const captured = freeze({ ...event, data: content.data });
  contents.set(captured, freeze(content));
  return captured;
}

/** One current selector for both admission and final preparation. FIFO is intentional;
 * duplicate pooling and recorded call/result group retention are separate dependent work.
 */
function selectHistory(source: Trajectory, limits: EvidenceLimits, maxHistoryBytes: number): Trajectory | null {
  const old = selections.get(source);
  let droppedEvents = old?.droppedEvents ?? 0;
  let priorOmittedEvents = old?.priorOmittedEvents ?? source.omitted;
  const maxEventBytes = Math.floor(maxHistoryBytes / 4);
  const observations: Observation[] = [];
  const start = Math.max(0, source.observations.length - limits.recentEvents);
  droppedEvents += start;
  for (let index = start; index < source.observations.length; index++) {
    const event = historySlot(source.observations, index);
    const captured = captureObservation(event, maxHistoryBytes);
    if (captured.status !== 'captured') {
      if (captured.status === 'invalid') priorOmittedEvents++; else droppedEvents++;
      continue;
    }
    const previous = contents.get(event as Observation);
    // Unknown trajectories are literal evidence, not authority for runtime marker metadata.
    const content = prepareContent(previous ? (previous.data as { content: unknown }).content : captured.data,
      maxEventBytes, [], previous);
    if (content) observations.push(captureEvent(captured.envelope, content)); else droppedEvents++;
  }
  const snapshot = (): Trajectory => {
    const selection: HistorySelection = { version: 'bounded-history-v2', maxHistoryBytes, maxEventBytes,
      retainedEvents: observations.length, shortenedEvents: observations.filter(event => contents.get(event)?.shortened).length,
      droppedEvents, priorOmittedEvents, exactCompactedBytes: 0 };
    const trajectory = freeze({ observations: [...observations], omitted: droppedEvents + priorOmittedEvents,
      limitations: [...source.limitations, ...((droppedEvents || priorOmittedEvents) && !source.limitations.includes('history-omitted') ? ['history-omitted'] : []),
        ...(observations.some(event => event.timestamp === null || event.callId === null || event.toolName === null)
          && !source.limitations.includes('metadata-unavailable') ? ['metadata-unavailable'] : [])], selection });
    selections.set(trajectory, selection);
    return trajectory;
  };
  let result = snapshot();
  while (serializedBytes(result) > maxHistoryBytes && observations.length) {
    observations.shift(); droppedEvents++; result = snapshot();
  }
  return serializedBytes(result) <= maxHistoryBytes ? result : null;
}

/** Owns descriptor-only normalization, redaction, SDK admission and immutable snapshots. */
export class HistoryPreparation {
  private trajectory: Trajectory;
  constructor(readonly sessionId: string, readonly limits: EvidenceLimits = EVIDENCE_DEFAULTS,
    private sensitiveFields: string[] = [], limitations: string[] = []) {
    this.trajectory = freeze({ observations: [], omitted: 0,
      limitations: ['untrusted-evidence-not-approval-authority', 'external-state-not-frozen', ...limitations] });
    this.retain(this.trajectory);
  }
  private retain(source: Trajectory): void {
    const allowance = Math.floor(this.limits.maxBytes / 3);
    const selected = selectHistory(source, this.limits, allowance);
    if (selected) { this.trajectory = selected; return; }
    // A tiny cap cannot fit even the empty history envelope. Keep bounded counters,
    // but no host content. Final preparation retains conservative capacity failure.
    const old = selections.get(source);
    const selection: HistorySelection = { version: 'bounded-history-v2', maxHistoryBytes: allowance,
      maxEventBytes: Math.floor(allowance / 4), retainedEvents: 0, shortenedEvents: 0,
      droppedEvents: (old?.droppedEvents ?? 0) + source.observations.length,
      priorOmittedEvents: old?.priorOmittedEvents ?? source.omitted, exactCompactedBytes: 0 };
    this.trajectory = freeze({ observations: [], omitted: selection.droppedEvents + selection.priorOmittedEvents,
      limitations: [...source.limitations, ...(!source.limitations.includes('history-omitted') && (selection.droppedEvents || selection.priorOmittedEvents) ? ['history-omitted'] : [])], selection });
    selections.set(this.trajectory, selection);
  }
  /** A known capture omission is distinct from an event dropped by this selector. */
  omit(count = 1): void {
    const old = selections.get(this.trajectory)!;
    const next = { ...this.trajectory, omitted: this.trajectory.omitted + count };
    selections.set(next, { ...old, priorOmittedEvents: old.priorOmittedEvents + count });
    this.retain(next);
  }
  add(origin: string, callId: string | null, toolName: string | null, data: unknown, timestamp: number | null): void {
    const old = selections.get(this.trajectory)!;
    const captured = captureObservation({ sessionId: this.sessionId, callId, toolName, origin, timestamp, data }, old.maxHistoryBytes);
    if (captured.status === 'invalid') { this.omit(); return; }
    const content = captured.status === 'captured' ? prepareContent(captured.data, old.maxEventBytes, this.sensitiveFields) : null;
    const source = { ...this.trajectory, observations: [...this.trajectory.observations] };
    selections.set(source, content ? old : { ...old, droppedEvents: old.droppedEvents + 1 });
    if (content && captured.status === 'captured') source.observations.push(captureEvent(captured.envelope, content));
    this.retain(source);
  }
  addHistory(history: readonly HistoryEvent[]): void {
    const length = history.length, start = Math.max(0, length - this.limits.recentEvents);
    // Never inspect the excluded prefix, including with zero history.
    const old = selections.get(this.trajectory)!;
    const next = { ...this.trajectory, omitted: this.trajectory.omitted + start };
    selections.set(next, { ...old, droppedEvents: old.droppedEvents + start });
    this.retain(next);
    for (let index = start; index < length; index++) {
      const event = ownHistoryFields(historySlot(history, index), ['kind', 'callId', 'toolName', 'data', 'timestamp']);
      if (!event || !['tool-call', 'tool-result'].includes(event.kind as string)) { this.omit(); continue; }
      this.add(`host-${event.kind}`, event.callId as string | null, event.toolName as string | null, event.data,
        (event.timestamp ?? null) as number | null);
    }
  }
  snapshot(): Trajectory { return this.trajectory; }
}

/** Protect current facts. Measurement counts the exact state projection, including integrity. */
export function prepareRequest(request: JudgeRequest, measureBytes: (request: JudgeRequest) => number,
  limits: EvidenceLimits = EVIDENCE_DEFAULTS): JudgeRequest | null {
  const source = selectHistory(request.trajectory ?? { observations: [], omitted: 0, limitations: ['history-unavailable'] },
    limits, Math.floor(limits.maxBytes / 3));
  if (!source) return null;
  let action = request.action;
  // Preserve optional-metadata priority under total-state pressure.
  if (measureBytes({ ...request, trajectory: source }) > limits.maxBytes && (action.description !== null || action.parameters !== null)) {
    action = { ...action, description: null, parameters: null, limitations: [...action.limitations, 'tool-metadata-omitted'] };
  }
  const empty = { observations: [], omitted: 0, limitations: [] };
  const protectedBytes = measureBytes({ ...request, action, trajectory: empty }) - serializedBytes(empty);
  if (protectedBytes >= limits.maxBytes) return null;
  const allowance = Math.min(Math.floor(limits.maxBytes / 3), limits.maxBytes - protectedBytes);
  const trajectory = selectHistory(source, limits, allowance);
  if (!trajectory) return null;
  const bounded = JSON.parse(JSON.stringify({ ...request, action, trajectory })) as JudgeRequest;
  bounded.trajectory!.observations.forEach((event, index) => {
    const content = contents.get(trajectory.observations[index]!);
    if (content) contents.set(event, content);
  });
  selections.set(bounded.trajectory!, trajectory.selection!);
  return measureBytes(bounded) <= limits.maxBytes ? freeze(bounded) : null;
}
