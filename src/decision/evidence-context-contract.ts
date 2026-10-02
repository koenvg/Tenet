import type { ResolvedAction } from '../runtime/resolved-action.js';
export const EVIDENCE_CONTEXT_VERSION = 'evidence-context-v1';
// Identity for the existing FIFO representation, not the later references/excerpts contract.
export const EVIDENCE_SELECTION_VERSION = 'bounded-history-v1';
export interface Limitations { readonly limitations: readonly string[]; readonly limitationsTruncated: boolean }
export interface EvidenceContext {
  readonly version: typeof EVIDENCE_CONTEXT_VERSION;
  readonly selectionVersion: typeof EVIDENCE_SELECTION_VERSION;
  readonly preparation: 'completed' | 'unavailable';
  readonly resolution: Limitations & { readonly status: ResolvedAction['status'] | 'unavailable' };
  readonly current: (Limitations & { readonly redactedFields: number }) | null;
  readonly history: (Limitations & { readonly recentEvents: number; readonly maxBytes: number;
    readonly retainedEvents: number; readonly retainedBytes: number; readonly omittedEvents: number }) | null;
}

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
  if (!object(value) || !only(value, ['version', 'selectionVersion', 'preparation', 'resolution', 'current', 'history'])
    || value.version !== EVIDENCE_CONTEXT_VERSION || value.selectionVersion !== EVIDENCE_SELECTION_VERSION
    || !['completed', 'unavailable'].includes(value.preparation as string)) return false;
  const r = value.resolution, c = value.current, h = value.history;
  if (!object(r) || !only(r, ['status', 'limitations', 'limitationsTruncated']) || !validLimitations(r)
    || !['unsupported', 'authenticated-partial', 'authenticated-complete', 'unavailable'].includes(r.status as string)) return false;
  if (c !== null && (!object(c) || !only(c, ['redactedFields', 'limitations', 'limitationsTruncated']) || !count(c.redactedFields) || !validLimitations(c))) return false;
  if (value.preparation === 'unavailable') return h === null;
  return r.status !== 'unavailable' && c !== null && object(h)
    && only(h, ['recentEvents', 'maxBytes', 'retainedEvents', 'retainedBytes', 'omittedEvents', 'limitations', 'limitationsTruncated'])
    && ['recentEvents', 'maxBytes', 'retainedEvents', 'retainedBytes', 'omittedEvents'].every(key => count(h[key]))
    && (h.maxBytes as number) > 0 && (h.retainedEvents as number) <= (h.recentEvents as number) && validLimitations(h);
}
