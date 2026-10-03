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

/** Encode only bounded normalized JSON. References are occurrence/path-specific;
 * an unsafe occurrence stays inline even when the same value is pooled elsewhere. */
function encodeHistory(value: Json, references: ReadonlyMap<string, string>, inlinePaths: ReadonlySet<string>, path: Path = []): Json {
  const key = JSON.stringify(path);
  if (inlinePaths.has(key)) return value;
  if (typeof value === 'string') {
    const ref = references.get(key);
    return ref === undefined ? value : { tenetHistory: { ref } };
  }
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((child, index) => encodeHistory(child, references, inlinePaths, [...path, index]));
  const literal: Record<string, Json> = Object.create(null);
  for (const [key, child] of Object.entries(value)) literal[key] = encodeHistory(child, references, inlinePaths, [...path, key]);
  return Object.hasOwn(value, 'tenetHistory') ? { tenetHistory: { literal } } : literal;
}
const inlineReferences = new Map<string, string>(), noPaths = new Set<string>();
const encodedData = (data: Json, references = inlineReferences, inlinePaths: ReadonlySet<string> = noPaths): Json => {
  const envelope = data as Record<string, Json>;
  return { ...envelope, content: encodeHistory(envelope.content!, references, inlinePaths) };
};
// Expanded event caps include literal escaping before any shared value can save bytes.
const expandedBytes = (data: Json) => bytes(encodedData(data));
const withinStructure = (value: unknown) => evidenceWithinBudget([value], Number.MAX_SAFE_INTEGER);
function referenceRoom(value: Json): number {
  if (!withinStructure(value)) return 0;
  let nodes = 0;
  const pending = [value];
  while (pending.length) {
    const next = pending.pop()!; nodes++;
    if (next && typeof next === 'object') pending.push(...Object.values(next));
  }
  return 4096 - nodes;
}

/** Pool equal retained sanitized strings, never envelopes or authored identities.
 * Private runtime paths exclude fragments. Structural eligibility is per occurrence.
 * The frame checks aggregate non-regression, not a new global admission/eviction cap. */
export function compactHistory(contents: readonly HistoryContent[],
  frame: (data: readonly Json[], values?: Readonly<Record<string, string>>) => unknown): { data: Json[]; values?: Readonly<Record<string, string>>; savedBytes: number } {
  const inlinePaths = contents.map(content => new Set([...content.excerpts, ...content.omissions].map(entry => JSON.stringify(entry.path))));
  const inline = contents.map((content, index) => encodedData(content.data, inlineReferences, inlinePaths[index]!));
  // Excerpt admission already checked candidate.data. Preserve that larger root
  // when admissible, without imposing it on previously over-limit inline events.
  const dataRoots = inline.map((data, index) => contents[index]!.shortened && withinStructure(data));
  const rooms = inline.map((data, index) => Math.min(referenceRoom((data as Record<string, Json>).content!),
    dataRoots[index] ? referenceRoom(data) : Number.POSITIVE_INFINITY));
  const candidates = new Map<string, { index: number; path: string }[]>();
  function count(value: Json, index: number, path: Path = [], wireDepth = 0): void {
    const key = JSON.stringify(path);
    if (inlinePaths[index]!.has(key)) return;
    if (typeof value === 'string') {
      // A reference adds two object levels and two nodes to this complete string.
      if (wireDepth <= (dataRoots[index] ? 61 : 62) && bytes(value) >= 256) {
        const occurrences = candidates.get(value) ?? [];
        occurrences.push({ index, path: key }); candidates.set(value, occurrences);
      }
    } else if (value && typeof value === 'object') {
      const childDepth = wireDepth + (!Array.isArray(value) && Object.hasOwn(value, 'tenetHistory') ? 3 : 1);
      for (const [key, child] of Object.entries(value)) count(child, index, [...path, Array.isArray(value) ? Number(key) : key], childDepth);
    }
  }
  contents.forEach((content, index) => { if (rooms[index]! >= 2) count((content.data as Record<string, Json>).content!, index); });
  const references = contents.map(() => new Map<string, string>()), values: Record<string, string> = Object.create(null);
  let entries = 0;
  for (const [value, occurrences] of candidates) {
    if (entries === 256) break;
    const used = new Map<number, number>();
    const safe = occurrences.filter(({ index }) => {
      const nodes = (used.get(index) ?? 0) + 2;
      if (nodes > rooms[index]!) return false;
      used.set(index, nodes); return true;
    });
    if (safe.length < 2) continue;
    const id = `v${entries}`, referenceBytes = bytes({ tenetHistory: { ref: id } });
    const cost = bytes(id) + 1 + bytes(value) + (entries ? 1 : 12);
    if (safe.length * (bytes(value) - referenceBytes) <= cost) continue;
    for (const { index, path } of safe) references[index]!.set(path, id);
    for (const [index, nodes] of used) rooms[index]! -= nodes;
    values[id] = value; entries++;
  }
  if (!entries) return { data: inline, savedBytes: 0 };
  const data = contents.map((content, index) => encodedData(content.data, references[index]!, inlinePaths[index]!));
  // Include pool entries, escaping and selector/envelope metadata where the inline
  // snapshot already met a global check. Never reject an older aggregate-over-limit
  // inline snapshot or invent content loss just to make this optimization fit.
  if (withinStructure(frame(inline)) && !withinStructure(frame(data, values))) return { data: inline, savedBytes: 0 };
  const savedBytes = bytes({ data: inline }) - bytes({ data, values });
  return savedBytes > 0 ? { data, values, savedBytes } : { data: inline, savedBytes: 0 };
}
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
      // Reserve the extra tagged literal nodes/depth before copying authored lookalikes.
      if (!Array.isArray(value) && Object.hasOwn(value, 'tenetHistory')) {
        nodes += 2; depth += 2;
        if (nodes > 4096 || depth > 64) return missing('history-structure-limit', path);
      }
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
  if (previous && expandedBytes(previous.data) <= maxBytes) return previous;
  const full = attempt(maxBytes);
  if (expandedBytes(full.data) <= maxBytes) return full;
  let best: HistoryContent | null = null, low = 0, high = Math.max(0, maxBytes);
  // Traversal is bounded, and every attempt remains pre-copy. Never serialize raw host data.
  while (low <= high) {
    const middle = Math.floor((low + high) / 2), candidate = attempt(middle);
    if (evidenceWithinBudget([candidate.data], Math.max(maxBytes * 16, 1024)) && expandedBytes(candidate.data) <= maxBytes) {
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
