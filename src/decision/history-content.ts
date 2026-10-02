import type { Json } from './contracts.js';
import { evidenceWithinBudget } from './evidence-budget.js';
import { sensitiveField } from './evidence.js';

type Path = (string | number)[];
interface Excerpt { path: Path; originalBytes: number; ranges: [number, number][] }
interface Omission { path: Path; reason: string }
export interface HistoryContent {
  data: Json; gaps: readonly string[]; shortened: boolean;
  excerpts: readonly Excerpt[];
  omissions: readonly Omission[];
}
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const omission = (reason: string): Json => ({ tenetOmission: reason });

// Slice at Unicode scalar boundaries, never through a UTF-8 sequence or surrogate pair.
function head(value: string, allowance: number): string {
  let end = Math.min(value.length, Math.max(0, allowance));
  if (end && /[\uD800-\uDBFF]/.test(value[end - 1]!)) end--;
  let candidate = value.slice(0, end);
  while (Buffer.byteLength(candidate) > allowance) {
    end -= end > 1 && /[\uDC00-\uDFFF]/.test(value[end - 1]!) ? 2 : 1;
    candidate = value.slice(0, end);
  }
  return candidate;
}
function tail(value: string, allowance: number): string {
  let start = Math.max(0, value.length - Math.max(0, allowance));
  if (start < value.length && /[\uDC00-\uDFFF]/.test(value[start]!)) start++;
  let candidate = value.slice(start);
  while (Buffer.byteLength(candidate) > allowance) {
    start += /[\uD800-\uDBFF]/.test(value[start]!) ? 2 : 1;
    candidate = value.slice(start);
  }
  return candidate;
}

/** Descriptor-only bounded admission. A rejected structure is never copied by jsonCopy.
 * Strings can be safely excerpted without traversing arbitrary host objects. The outer
 * data.selection paths, created here, distinguish excerpts from literal lookalikes.
 */
export function prepareContent(input: unknown, maxBytes: number, sensitive: readonly string[] = [],
  previous?: HistoryContent): HistoryContent | null {
  const prior = new Map(previous?.excerpts.map(excerpt => [JSON.stringify(excerpt.path), excerpt]));
  const priorOmissions = new Map(previous?.omissions.map(omission => [JSON.stringify(omission.path), omission.reason]));
  // Binary search the retained text allowance; the complete data envelope and metadata count.
  function attempt(textBytes: number): HistoryContent {
    const gaps = new Set(previous?.gaps ?? []);
    const excerpts: Excerpt[] = [];
    const omissions: { path: Path; reason: string }[] = [];
    let nodes = 0, structuralBytes = 0, redactedFields = 0;
    const seen = new WeakSet<object>();
    const missing = (reason: string, path: Path): Json => {
      const prefix = (candidate: Path) => path.every((part, index) => candidate[index] === part);
      for (let index = excerpts.length - 1; index >= 0; index--) if (prefix(excerpts[index]!.path)) excerpts.splice(index, 1);
      for (let index = omissions.length - 1; index >= 0; index--) if (prefix(omissions[index]!.path)) omissions.splice(index, 1);
      gaps.add(reason); omissions.push({ path, reason }); return omission(reason);
    };
    const excerpt = (value: string, path: Path, old?: Excerpt, oldTail?: string): Json => {
      const first = head(value, Math.floor(textBytes / 2));
      const last = tail(oldTail ?? value, Math.floor(textBytes / 2));
      const originalBytes = old?.originalBytes ?? Buffer.byteLength(value);
      excerpts.push({ path, originalBytes, ranges: [[0, Buffer.byteLength(first)], [originalBytes - Buffer.byteLength(last), originalBytes]] });
      gaps.add('history-content-shortened');
      return { tenetExcerpt: { head: first, tail: last } };
    };
    function visit(value: unknown, path: Path, depth: number): Json {
      if (++nodes > 4096 || depth > 64 || structuralBytes > 24576) return missing('history-structure-limit', path);
      const oldOmission = priorOmissions.get(JSON.stringify(path));
      if (oldOmission) return missing(oldOmission, path);
      const old = prior.get(JSON.stringify(path));
      if (old) {
        const parts = (value as { tenetExcerpt: { head: string; tail: string } }).tenetExcerpt;
        return excerpt(parts.head, path, old, parts.tail);
      }
      if (typeof value === 'string') {
        if (value.length > textBytes || bytes(value) > textBytes) return excerpt(value, path);
        structuralBytes += bytes(value); return value;
      }
      if (value === undefined) return missing('metadata-unavailable', path);
      if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) { structuralBytes += 32; return value; }
      if (typeof value !== 'object') return missing('unsupported-content', path);
      if (seen.has(value)) return missing('unsupported-circular-content', path);
      if (![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) return missing('unsupported-content', path);
      const type = Object.getOwnPropertyDescriptor(value, 'type');
      if (type && 'value' in type && type.value === 'image') return missing('unsupported-image', path);
      if (Array.isArray(value) && value.length > 4096) return missing('history-structure-limit', path);
      seen.add(value);
      try {
        const result: Json[] | Record<string, Json> = Array.isArray(value) ? [] : Object.create(null);
        let count = 0;
        for (const key in value) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor) continue;
          if (++count > 4096 || nodes + count > 4096 || key.length > 24576 || structuralBytes + bytes(key) > 24576) return missing('history-structure-limit', path);
          structuralBytes += bytes(key) + 2;
          if (!Array.isArray(value) && sensitiveField(key, sensitive)) { redactedFields++; gaps.add('fields-redacted'); continue; }
          const childPath = [...path, Array.isArray(value) ? Number(key) : key];
          const child = 'value' in descriptor ? visit(descriptor.value, childPath, depth + 1) : missing('unsupported-accessor', childPath);
          if (Array.isArray(result)) {
            // Sparse arrays and authored extra keys cannot silently become complete JSON.
            if (key !== String(result.length)) return missing('unsupported-content', path);
            result.push(child);
          } else result[key] = child;
        }
        if (Array.isArray(value) && (result as Json[]).length !== value.length) return missing('unsupported-content', path);
        return result;
      } finally { seen.delete(value); }
    }
    let content: Json;
    try { content = visit(input, [], 0); }
    catch { content = missing('unsupported-content', []); }
    redactedFields += previous && previous.data && typeof previous.data === 'object' && !Array.isArray(previous.data)
      ? Number(previous.data.redactedFields ?? 0) : 0;
    const data: Json = { content, redactedFields, limitations: redactedFields ? ['fields-redacted'] : [],
      ...(excerpts.length || omissions.length ? { selection: { excerpts: excerpts as unknown as Json, omissions: omissions as unknown as Json } } : {}) };
    return { data, gaps: [...gaps], shortened: !!previous?.shortened || excerpts.length > 0 || omissions.length > 0, excerpts, omissions };
  }
  // Fast path only for already bounded JSON. It avoids repeatedly inspecting arbitrary inputs.
  if (previous && bytes(previous.data) <= maxBytes) return previous;
  const full = attempt(maxBytes);
  if (bytes(full.data) <= maxBytes) return full;
  let best: HistoryContent | null = null, low = 0, high = Math.max(0, maxBytes);
  // Traversal is bounded, and every attempt remains pre-copy. Never serialize raw host data.
  while (low <= high) {
    const middle = Math.floor((low + high) / 2), candidate = attempt(middle);
    if (evidenceWithinBudget([candidate.data], Math.max(maxBytes * 16, 1024)) && bytes(candidate.data) <= maxBytes) {
      best = candidate; low = middle + 1;
    } else high = middle - 1;
  }
  if (best) return best;
  const redactedFields = (full.data as { redactedFields: number }).redactedFields;
  const data = { content: omission('history-content-omitted'), redactedFields,
    limitations: redactedFields ? ['fields-redacted'] : [],
    selection: { excerpts: [], omissions: [{ path: [], reason: 'history-content-omitted' }] } };
  return bytes(data) <= maxBytes ? { data, gaps: [...new Set([...(redactedFields ? ['fields-redacted'] : []), 'history-content-omitted'])], shortened: true, excerpts: [], omissions: data.selection.omissions } : null;
}
