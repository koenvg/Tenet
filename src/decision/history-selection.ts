import type { EvidenceLimits, HistoryEvent, HistorySelection, JudgeRequest, Observation, Trajectory } from './contracts.js';
import { freeze } from './evidence.js';
import { prepareContent, compactHistory, type HistoryContent } from './history-content.js';
import { captureObservation, historySlot, ownHistoryFields, type ObservationEnvelope } from './history-envelope.js';
import { HISTORY_ADMISSION_SLOTS, historyGroups, type HistoryCandidate } from './history-groups.js';
import { historyCount } from './history-capture.js';

export const EVIDENCE_DEFAULTS: Readonly<EvidenceLimits> = Object.freeze({ recentEvents: 12, maxBytes: 24 * 1024 });
export const serializedBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
// Runtime provenance never comes from authored marker-shaped values or selector counters.
const contents = new WeakMap<Observation, HistoryContent>();
// Encoding is private ingestion provenance, never inferred from a public host name.
const recoveredCalls = new WeakSet<object>();
const selections = new WeakMap<Trajectory, HistorySelection>();
// Preserve observed ambiguity through tightening, compaction and immutable copies.
const ambiguous = new WeakSet<Observation>();
export const observationLimitations = (event: Observation): readonly string[] => contents.get(event)?.gaps ?? [];


export type PreparedToolCall = { readonly toolName: string; readonly arguments: import('./contracts.js').Json };
export type PreviousToolCall = PreparedToolCall | null | { readonly status: 'unavailable' };
// Private lineage follows the latest ingested call through eviction and immutable copies.
// An older surviving call must never replace a lost latest call.
const latestCalls = new WeakMap<Trajectory, Observation | null | 'unavailable'>();
const unavailable = Object.freeze({ status: 'unavailable' as const });
function latestIn(source: Trajectory, maxEnvelopeBytes = Math.floor(EVIDENCE_DEFAULTS.maxBytes / 3)): Observation | null | 'unavailable' {
  if (latestCalls.has(source)) return latestCalls.get(source)!;
  let latest: Observation | null | 'unavailable' = source.omitted || source.observations.length > HISTORY_ADMISSION_SLOTS || source.limitations.some(value =>
    ['history-unavailable', 'history-admission-window', 'history-omitted'].includes(value)) ? 'unavailable' : null;
  // A public/raw snapshot has no loss-order provenance. Do not infer the latest
  // call from its remaining events when any part of the window is unknown.
  if (latest === 'unavailable') return latest;
  for (let index = Math.max(0, source.observations.length - HISTORY_ADMISSION_SLOTS); index < source.observations.length; index++) {
    const event = historySlot(source.observations, index) as Observation;
    const captured = captureObservation(event, maxEnvelopeBytes);
    if (captured.status !== 'captured') latest = 'unavailable';
    else if (captured.envelope.origin.endsWith('-tool-call')) latest = event;
    else if (!captured.envelope.origin.endsWith('-tool-result') || latest === null) latest = 'unavailable';
  }
  return latest;
}

/** Project expanded runtime-owned content, never interpret authored marker tags. */
export function previousToolCall(trajectory: Trajectory | undefined, sessionId?: string): PreviousToolCall {
  if (!trajectory) return unavailable;
  const latest = latestIn(trajectory);
  if (latest === null) return null;
  if (latest === 'unavailable' || !latest.toolName || sessionId !== undefined && latest.sessionId !== sessionId) return unavailable;
  const content = contents.get(latest);
  if (!content) return unavailable;
  const value = (content.data as { content: import('./contracts.js').Json }).content;
  const live = !recoveredCalls.has(latest);
  const fields = live ? ownHistoryFields(value, ['arguments']) : null;
  if (live && (!fields || fields.arguments === undefined)) return unavailable;
  const path = live ? ['arguments'] : [];
  if ([...content.excerpts, ...content.omissions].some(entry =>
    entry.path.every((part, index) => path[index] === part) || path.every((part, index) => entry.path[index] === part))) return unavailable;
  return freeze({ toolName: latest.toolName, arguments: (live ? fields!.arguments : value) as import('./contracts.js').Json });
}
function captureEvent(event: ObservationEnvelope, content: HistoryContent): Observation {
  const captured = freeze({ ...event, data: content.data });
  contents.set(captured, freeze(content));
  return captured;
}

/** One current admission/final selector. Count selection groups bounded envelopes
 * before payload normalization; exact compaction precedes whole-group byte eviction. */
function selectHistory(source: Trajectory, limits: EvidenceLimits, maxHistoryBytes: number, sensitiveFields: readonly string[] = []): Trajectory {
  const old = selections.get(source);
  const latest = latestIn(source, maxHistoryBytes);
  let selectedLatest: Observation | null | 'unavailable' = latest === null ? null : 'unavailable';
  let droppedEvents = old?.droppedEvents ?? 0;
  let priorOmittedEvents = old?.priorOmittedEvents ?? source.omitted;
  const maxEventBytes = Math.floor(maxHistoryBytes / 4);
  const observations: Observation[] = [];
  const groups: Observation[][] = [];
  const order = new Map<Observation, number>();
  const start = limits.recentEvents === 0 ? source.observations.length : Math.max(0, source.observations.length - HISTORY_ADMISSION_SLOTS);
  const limitations = [...source.limitations];
  if (limits.recentEvents === 0) droppedEvents = historyCount(droppedEvents, start);
  else if (start) {
    priorOmittedEvents = historyCount(priorOmittedEvents, start);
    if (!limitations.includes('history-admission-window')) limitations.push('history-admission-window');
  }
  const candidates: HistoryCandidate[] = [];
  for (let index = start; index < source.observations.length; index++) {
    const event = historySlot(source.observations, index);
    const captured = captureObservation(event, maxHistoryBytes);
    if (captured.status !== 'captured') {
      if (captured.status === 'invalid') priorOmittedEvents = historyCount(priorOmittedEvents, 1);
      else droppedEvents = historyCount(droppedEvents, 1);
      continue;
    }
    candidates.push({ ...captured, source: event, index, ambiguous: ambiguous.has(event as Observation) });
  }
  let retained = 0;
  for (const group of historyGroups(candidates)) {
    if (retained + group.length > limits.recentEvents) { droppedEvents = historyCount(droppedEvents, group.length); continue; }
    retained += group.length;
    const normalized: Observation[] = [];
    for (const candidate of group) {
      const previous = contents.get(candidate.source as Observation);
      // Unknown trajectories are literal evidence, not runtime marker authority.
      const content = prepareContent(previous ? (previous.data as { content: unknown }).content : candidate.data,
        maxEventBytes, sensitiveFields, previous);
      if (!content) break;
      const event = captureEvent(candidate.envelope, content);
      if (recoveredCalls.has(candidate.source as Observation)) recoveredCalls.add(event);
      if (candidate.source === latest) selectedLatest = event;
      order.set(event, candidate.index);
      if (candidate.ambiguous) ambiguous.add(event);
      normalized.push(event);
    }
    if (normalized.length === group.length) groups.push(normalized);
    else droppedEvents = historyCount(droppedEvents, group.length);
  }
  // Groups are newest-first, but the submitted events keep their original order.
  observations.push(...groups.flat().sort((a, b) => order.get(a)! - order.get(b)!));
  const snapshot = (): Trajectory => {
    const summary: HistorySelection = { version: 'bounded-history-v2', maxHistoryBytes, maxEventBytes,
      retainedEvents: observations.length, shortenedEvents: observations.filter(event => contents.get(event)?.shortened).length,
      droppedEvents, priorOmittedEvents, exactCompactedBytes: 0 };
    const envelope = { omitted: historyCount(droppedEvents, priorOmittedEvents),
      limitations: [...limitations, ...((droppedEvents || priorOmittedEvents) && !limitations.includes('history-omitted') ? ['history-omitted'] : []),
        ...(observations.some(event => event.timestamp === null || event.callId === null || event.toolName === null)
          && !source.limitations.includes('metadata-unavailable') ? ['metadata-unavailable'] : [])] };
    const compacted = compactHistory(observations.map(event => contents.get(event)!), (data, values) => ({
      observations: observations.map((event, index) => ({ ...event, data: data[index]! })), ...envelope,
      selection: summary, ...(values ? { values } : {}) }));
    const selection = { ...summary, exactCompactedBytes: compacted.savedBytes };
    const encoded = observations.map((event, index) => {
      const copy = freeze({ ...event, data: compacted.data[index]! });
      contents.set(copy, contents.get(event)!);
      if (recoveredCalls.has(event)) recoveredCalls.add(copy);
      if (ambiguous.has(event)) ambiguous.add(copy);
      return copy;
    });
    const trajectory = freeze({ observations: encoded, ...envelope, selection,
      ...(compacted.values ? { values: compacted.values } : {}) });
    selections.set(trajectory, selection);
    const latestIndex = typeof selectedLatest === 'object' && selectedLatest !== null ? observations.indexOf(selectedLatest) : -1;
    latestCalls.set(trajectory, selectedLatest === null ? null : latestIndex < 0 ? 'unavailable' : encoded[latestIndex]!);
    return trajectory;
  };
  let result = snapshot();
  // Tighten expanded data uniformly before losing a recorded relationship. Each
  // retry includes excerpt/omission metadata and regenerates the exact values pool.
  let contentBudget = maxEventBytes;
  while (serializedBytes(result) > maxHistoryBytes && observations.length && contentBudget > 0) {
    contentBudget = Math.floor(contentBudget / 2);
    for (const event of observations) {
      const previous = contents.get(event)!;
      const content = prepareContent((previous.data as { content: unknown }).content, contentBudget, [], previous);
      if (content) contents.set(event, freeze(content));
    }
    result = snapshot();
  }
  while (serializedBytes(result) > maxHistoryBytes && observations.length) {
    const removed = groups.pop()!;
    for (const event of removed) observations.splice(observations.indexOf(event), 1);
    droppedEvents = historyCount(droppedEvents, removed.length); result = snapshot();
  }
  // An empty envelope can exceed a tiny allowance. Preserve the actual admission
  // counters here; final preparation refuses submission rather than guessing losses.
  return result;
}

/** Owns descriptor-only normalization, redaction, SDK admission and immutable snapshots. */
export class HistoryPreparation {
  private trajectory: Trajectory;
  constructor(readonly sessionId: string, readonly limits: EvidenceLimits = EVIDENCE_DEFAULTS,
    private sensitiveFields: string[] = [], limitations: string[] = []) {
    this.trajectory = freeze({ observations: [], omitted: 0,
      limitations: ['untrusted-evidence-not-approval-authority', 'external-state-not-frozen', ...limitations] });
    latestCalls.set(this.trajectory, limitations.includes('history-unavailable') ? 'unavailable' : null);
    this.retain(this.trajectory);
  }
  private retain(source: Trajectory): void {
    const allowance = Math.floor(this.limits.maxBytes / 3);
    this.trajectory = selectHistory(source, this.limits, allowance, this.sensitiveFields);
  }
  /** A known capture omission is distinct from an event dropped by this selector. */
  omit(count = 1): void {
    const old = selections.get(this.trajectory)!;
    const next = { ...this.trajectory, omitted: historyCount(this.trajectory.omitted, count) };
    selections.set(next, { ...old, priorOmittedEvents: historyCount(old.priorOmittedEvents, count) });
    latestCalls.set(next, count ? 'unavailable' : latestIn(this.trajectory));
    this.retain(next);
  }
  add(origin: string, callId: string | null, toolName: string | null, data: unknown, timestamp: number | null): void {
    this.addBatch([{ sessionId: this.sessionId, origin, callId, toolName, data, timestamp }]);
  }
  /** Batch adapters collect eligible envelopes, not sanitized payloads or decisions. */
  addBatch(events: readonly unknown[], priorOmitted = 0, admissionLimited = false): void {
    const old = selections.get(this.trajectory)!;
    const length = events.length;
    const start = this.limits.recentEvents === 0 ? length : Math.max(0, length - HISTORY_ADMISSION_SLOTS);
    const next = { ...this.trajectory, observations: [...this.trajectory.observations],
      limitations: [...this.trajectory.limitations] };
    for (let index = start; index < length; index++) next.observations.push(historySlot(events, index) as Observation);
    let latest = priorOmitted || admissionLimited || start ? 'unavailable' as const : latestIn(this.trajectory);
    for (let index = start; index < length; index++) {
      const event = historySlot(events, index) as Observation;
      const captured = captureObservation(event, Math.floor(this.limits.maxBytes / 3));
      if (captured.status !== 'captured') latest = 'unavailable';
      else if (captured.envelope.origin.endsWith('-tool-call')) latest = event;
      else if (!captured.envelope.origin.endsWith('-tool-result') || latest === null) latest = 'unavailable';
    }
    // Capture counters have no omission-order provenance. A surviving call in
    // this recovery batch cannot establish that no newer call was lost.
    if (priorOmitted || admissionLimited) latest = 'unavailable';
    latestCalls.set(next, latest);
    const zeroDrops = this.limits.recentEvents === 0 ? start : 0;
    selections.set(next, { ...old, droppedEvents: historyCount(old.droppedEvents, zeroDrops),
      priorOmittedEvents: historyCount(old.priorOmittedEvents, priorOmitted, this.limits.recentEvents ? start : 0) });
    if ((admissionLimited || start && this.limits.recentEvents) && !next.limitations.includes('history-admission-window')) {
      next.limitations.push('history-admission-window');
    }
    this.retain(next);
  }
  addHistory(history: readonly HistoryEvent[], priorOmitted = 0, admissionLimited = false): void {
    this.addBatch([], priorOmitted, admissionLimited);
    const length = history.length;
    // Zero history never reads slots. Nonzero history scans a fixed bounded suffix.
    const start = this.limits.recentEvents === 0 ? length : Math.max(0, length - HISTORY_ADMISSION_SLOTS);
    const events: unknown[] = [];
    for (let index = start; index < length; index++) {
      const event = ownHistoryFields(historySlot(history, index), ['kind', 'callId', 'toolName', 'data', 'timestamp']);
      const translated = event && ['tool-call', 'tool-result'].includes(event.kind as string)
        ? { sessionId: this.sessionId, origin: `host-${event.kind}`, callId: event.callId,
          toolName: event.toolName, data: event.data, timestamp: event.timestamp ?? null } : undefined;
      if (translated && event!.kind === 'tool-call') recoveredCalls.add(translated);
      events.push(translated);
    }
    if (this.limits.recentEvents === 0) {
      const old = selections.get(this.trajectory)!;
      const next = { ...this.trajectory };
      selections.set(next, { ...old, droppedEvents: historyCount(old.droppedEvents, length) });
      latestCalls.set(next, length ? 'unavailable' : latestIn(this.trajectory));
      this.retain(next);
    } else {
      this.addBatch(events, start, start > 0);
      // The first empty admission above preserves the existing capture counters.
      // Keep its unordered recovery loss private through the translated batch.
      if (priorOmitted || admissionLimited) latestCalls.set(this.trajectory, 'unavailable');
    }
  }
  snapshot(): Trajectory { return this.trajectory; }
}

/** Scoped preparation reuses bounded admission without serializing history as model state. */
export function prepareScopedHistory(trajectory: Trajectory | undefined, limits: EvidenceLimits = EVIDENCE_DEFAULTS,
  sensitiveFields: readonly string[] = []): Trajectory {
  return selectHistory(trajectory ?? { observations: [], omitted: 0, limitations: ['history-unavailable'] },
    limits, Math.floor(limits.maxBytes / 3), sensitiveFields);
}

function copyHistoryProvenance(source: Trajectory, target: Trajectory): void {
  target.observations.forEach((event, index) => {
    const original = source.observations[index]!;
    const content = contents.get(original);
    if (content) contents.set(event, content);
    if (recoveredCalls.has(original)) recoveredCalls.add(event);
    if (ambiguous.has(original)) ambiguous.add(event);
  });
  selections.set(target, source.selection!);
  const latest = latestIn(source);
  latestCalls.set(target, latest === null || latest === 'unavailable' ? latest
    : target.observations[source.observations.indexOf(latest)] ?? 'unavailable');
}

/** Finalize bounded public history without exposing its internal maps or losing provenance. */
export function canonicalHistory(source: Trajectory): Trajectory {
  const snapshot = JSON.parse(JSON.stringify(source)) as Trajectory;
  copyHistoryProvenance(source, snapshot);
  return freeze(snapshot);
}

/** Protect current facts. Measurement counts the exact state projection, including integrity. */
export function prepareRequest(request: JudgeRequest, measureBytes: (request: JudgeRequest) => number,
  limits: EvidenceLimits = EVIDENCE_DEFAULTS): JudgeRequest | null {
  const source = selectHistory(request.trajectory ?? { observations: [], omitted: 0, limitations: ['history-unavailable'] },
    limits, Math.floor(limits.maxBytes / 3));
  if (serializedBytes(source) > Math.floor(limits.maxBytes / 3)) return null;
  const original = request.action;
  const omittedMetadata = [...original.limitations, 'tool-metadata-omitted'];
  const tiers = [original];
  if (original.parameters !== null) tiers.push({ ...original, parameters: null, limitations: omittedMetadata });
  if (original.description !== null) tiers.push({ ...original, description: null, parameters: null, limitations: omittedMetadata });
  const empty = { observations: [], omitted: 0, limitations: [] };
  let selected: { action: JudgeRequest['action']; allowance: number } | undefined;
  // Choose metadata against the exact current-only state, including all final
  // history omissions and selector metadata. Failed tiers never become the source.
  for (const action of tiers) {
    const protectedBytes = measureBytes({ ...request, action, trajectory: empty }) - serializedBytes(empty);
    const allowance = Math.min(Math.floor(limits.maxBytes / 3), limits.maxBytes - protectedBytes);
    if (allowance < 0) continue;
    const currentOnly = selectHistory(source, { ...limits, recentEvents: 0 }, allowance);
    if (serializedBytes(currentOnly) <= allowance && measureBytes({ ...request, action, trajectory: currentOnly }) <= limits.maxBytes) {
      selected = { action, allowance };
      break;
    }
  }
  if (!selected) return null;
  const { action, allowance } = selected;
  const trajectory = selectHistory(source, limits, allowance);
  if (serializedBytes(trajectory) > allowance) return null;
  const bounded = JSON.parse(JSON.stringify({ ...request, action, trajectory })) as JudgeRequest;
  copyHistoryProvenance(trajectory, bounded.trajectory!);
  return measureBytes(bounded) <= limits.maxBytes ? freeze(bounded) : null;
}
