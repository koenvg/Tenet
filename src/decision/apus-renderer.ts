// Port of APUS AI-LAB openjev_contracts.py at revision 7389d774472c9e29ddc84fffb392951f0f25de74.
// Apache-2.0. See third-party/apus/LICENSE and NOTICE.
import type { Json } from './contracts.js';

export const APUS_RENDERING_VERSION = 'jev.dynamic.prompt.v2';
export const APUS_REVISION = '7389d774472c9e29ddc84fffb392951f0f25de74';
export const APUS_LABELS = 'ABCDEFGHIJKLMNOP';
export interface ApusQuestion { state: string; instructions: string; criteria: readonly { id: string; description: string }[] }

// Python sorts Unicode code points, not UTF-16 units. Do not build a JS object:
// its integer-like keys would be reordered during JSON.stringify.
function codePointOrder(a: string, b: string): number {
  const left = Array.from(a, c => c.codePointAt(0)!), right = Array.from(b, c => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
  return left.length - right.length;
}
/** Sorted JSON text with ensure_ascii=False and Python's default comma/colon separators. */
export function sortedJson(value: Json): string {
  if (Array.isArray(value)) return '[' + value.map(sortedJson).join(', ') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort(codePointOrder)
    .map(key => JSON.stringify(key) + ': ' + sortedJson(value[key]!)).join(', ') + '}';
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('non-json-number');
  return JSON.stringify(value);
}
export function renderApus(record: ApusQuestion) {
  if (!record.state.trim() || !record.instructions.trim() || record.criteria.length < 2 || record.criteria.length > 16
    || record.criteria.some(c => !c.id.trim() || !c.description.trim())
    || new Set(record.criteria.map(c => c.id)).size !== record.criteria.length) throw new Error('invalid-apus-question');
  const mapping = Object.fromEntries(record.criteria.map((c, i) => [APUS_LABELS[i]!, c.id]));
  const prefix = 'Shared state:\n' + record.state + '\n\n';
  const task = { primitive: 'choice', instructions: record.instructions,
    criteria: record.criteria.map((c, i) => ({ label: APUS_LABELS[i]!, description: c.description })) };
  const suffix = sortedJson(task) + '\nReturn only the selected letter: ' + Object.keys(mapping).join(', ') + '.\nAnswer:';
  const prompt = prefix + suffix;
  const chat = '<|im_start|>user\n' + prompt + '<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n';
  return { prefix, suffix, prompt, chat, mapping };
}
