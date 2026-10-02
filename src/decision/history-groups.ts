import type { ObservationEnvelope } from './history-envelope.js';

/** These are admission slots, not JSON nodes in an emitted trajectory. */
export const HISTORY_ADMISSION_SLOTS = 4096;
export interface HistoryCandidate {
  envelope: ObservationEnvelope;
  data: unknown;
  source: unknown;
  index: number;
  ambiguous: boolean;
}

/** Window-local recorded relationships only. No content, tool names or timestamps. */
export function historyGroups(candidates: readonly HistoryCandidate[]): HistoryCandidate[][] {
  const identities = new Map<string, { calls: HistoryCandidate[]; ambiguous: boolean }>();
  const key = ({ sessionId, callId }: ObservationEnvelope) => sessionId && callId ? JSON.stringify([sessionId, callId]) : null;
  for (const candidate of candidates) {
    const identity = key(candidate.envelope);
    if (identity === null) continue;
    const entry = identities.get(identity) ?? { calls: [], ambiguous: false };
    if (candidate.envelope.origin.endsWith('-tool-call')) entry.calls.push(candidate);
    entry.ambiguous ||= candidate.ambiguous;
    identities.set(identity, entry);
  }
  const groups: HistoryCandidate[][] = [], paired = new Map<HistoryCandidate, HistoryCandidate[]>();
  for (const candidate of candidates) {
    const identity = key(candidate.envelope), entry = identity === null ? undefined : identities.get(identity);
    candidate.ambiguous ||= !!entry && (entry.ambiguous || entry.calls.length > 1);
    const call = !candidate.ambiguous && entry?.calls.length === 1 ? entry.calls[0] : undefined;
    // A result before the only visible call cannot be a result of that later call.
    if (!call || candidate.index < call.index) { groups.push([candidate]); continue; }
    let group = paired.get(call);
    if (!group) { group = []; paired.set(call, group); groups.push(group); }
    group.push(candidate);
  }
  return groups.sort((a, b) => b[b.length - 1]!.index - a[a.length - 1]!.index);
}
