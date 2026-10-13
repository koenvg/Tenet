import type { ResolvedAction } from '../runtime/resolved-action.js';
export const EVIDENCE_CONTEXT_VERSION = 'evidence-context-v1';
// Readers preserve the original FIFO identity; only v2 is emitted by the runtime.
export const EVIDENCE_SELECTION_VERSION = 'bounded-history-v2';
export interface Limitations { readonly limitations: readonly string[]; readonly limitationsTruncated: boolean }
interface EvidenceContextBase {
  readonly version: typeof EVIDENCE_CONTEXT_VERSION | 'evidence-context-v2';
  readonly preparation: 'completed' | 'unavailable';
  readonly resolution: Limitations & { readonly status: ResolvedAction['status'] | 'unavailable' };
  readonly current: (Limitations & { readonly redactedFields: number }) | null;
}
interface HistoryContext extends Limitations {
  readonly recentEvents: number; readonly maxBytes: number;
  readonly retainedEvents: number; readonly retainedBytes: number; readonly omittedEvents: number;
}
interface SelectionCounters {
  readonly maxHistoryBytes: number; readonly maxEventBytes: number; readonly shortenedEvents: number;
  readonly droppedEvents: number; readonly priorOmittedEvents: number; readonly exactCompactedBytes: number;
}
export type EvidenceContext = EvidenceContextBase & (
  | { readonly selectionVersion: 'bounded-history-v1'; readonly history: (HistoryContext & { readonly [K in keyof SelectionCounters]?: never }) | null }
  | { readonly selectionVersion: typeof EVIDENCE_SELECTION_VERSION; readonly history: (HistoryContext & SelectionCounters) | null }
  | { readonly selectionVersion: 'judge-input-scopes-v1'; readonly history: null;
      readonly scopes: readonly { readonly id: string; readonly stateBytes: number; readonly fields: readonly string[] }[];
      readonly totalStateBytes: number }
);

const encoder = new TextEncoder();
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
function validLimitations(value: Record<string, unknown>): boolean {
  return typeof value.limitationsTruncated === 'boolean' && Array.isArray(value.limitations) && value.limitations.length <= 16
    && value.limitations.every(v => typeof v === 'string' && encoder.encode(v).length <= 128);
}
/** Schema and native-history readers validate bounds without deriving coverage from raw evidence. */
export function validEvidenceContext(value: unknown): value is EvidenceContext {
  if (!object(value) || !['completed', 'unavailable'].includes(value.preparation as string)) return false;
  const scoped = value.version === 'evidence-context-v2' && value.selectionVersion === 'judge-input-scopes-v1';
  if (!scoped && (value.version !== EVIDENCE_CONTEXT_VERSION
    || !['bounded-history-v1', EVIDENCE_SELECTION_VERSION].includes(value.selectionVersion as string))) return false;
  if (!only(value, ['version', 'selectionVersion', 'preparation', 'resolution', 'current', 'history',
    ...(scoped ? ['scopes', 'totalStateBytes'] : [])])) return false;
  const r = value.resolution, c = value.current, h = value.history;
  if (!object(r) || !only(r, ['status', 'limitations', 'limitationsTruncated']) || !validLimitations(r)
    || !['unsupported', 'authenticated-partial', 'authenticated-complete', 'unavailable'].includes(r.status as string)) return false;
  if (c !== null && (!object(c) || !only(c, ['redactedFields', 'limitations', 'limitationsTruncated']) || !count(c.redactedFields) || !validLimitations(c))) return false;
  if (scoped) return h === null && value.preparation === 'completed' && r.status !== 'unavailable' && c !== null
    && Array.isArray(value.scopes) && value.scopes.length > 0 && value.scopes.length <= 129
    && value.scopes.every(s => object(s) && only(s, ['id', 'stateBytes', 'fields'])
      && typeof s.id === 'string' && s.id.length > 0 && s.id.length <= 128 && count(s.stateBytes)
      && Array.isArray(s.fields) && s.fields.length <= 16 && s.fields.every(f => typeof f === 'string' && f.length <= 128)
      && new Set(s.fields).size === s.fields.length)
    && new Set(value.scopes.map(s => s.id)).size === value.scopes.length && count(value.totalStateBytes)
    && value.totalStateBytes === value.scopes.reduce((n, s) => n + s.stateBytes, 0);
  if (value.preparation === 'unavailable') return h === null;
  const extra = value.selectionVersion === EVIDENCE_SELECTION_VERSION
    ? ['maxHistoryBytes', 'maxEventBytes', 'shortenedEvents', 'droppedEvents', 'priorOmittedEvents', 'exactCompactedBytes'] : [];
  if (!(r.status !== 'unavailable' && c !== null && object(h)
    && only(h, ['recentEvents', 'maxBytes', 'retainedEvents', 'retainedBytes', 'omittedEvents', 'limitations', 'limitationsTruncated', ...extra])
    && ['recentEvents', 'maxBytes', 'retainedEvents', 'retainedBytes', 'omittedEvents', ...extra].every(key => count(h[key]))
    && (h.maxBytes as number) > 0 && (h.retainedEvents as number) <= (h.recentEvents as number) && validLimitations(h))) return false;
  return !extra.length || (h.maxHistoryBytes as number) <= Math.floor((h.maxBytes as number) / 3)
    && (h.retainedBytes as number) <= (h.maxHistoryBytes as number)
    && (h.maxEventBytes as number) === Math.floor((h.maxHistoryBytes as number) / 4)
    && (h.shortenedEvents as number) <= (h.retainedEvents as number)
    && (h.omittedEvents as number) === (h.droppedEvents as number) + (h.priorOmittedEvents as number);
}
