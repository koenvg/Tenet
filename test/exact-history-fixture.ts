import assert from 'node:assert/strict';

// Independent decoder for the bounded runtime wire grammar. No authored pools are
// admitted by the runtime; tests use only a captured, immutable submitted snapshot.
export function expand(value: any, values: Record<string, string> = {}, depth = 0): any {
  assert.ok(depth <= 128);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(child => expand(child, values, depth + 1));
  if (Object.keys(value).length === 1 && value.tenetHistory) {
    const tag = value.tenetHistory;
    if (Object.keys(tag).length === 1 && typeof tag.ref === 'string') {
      assert.ok(Object.hasOwn(values, tag.ref)); return values[tag.ref];
    }
    if (Object.keys(tag).length === 1 && Object.hasOwn(tag, 'literal')) {
      return Object.fromEntries(Object.entries(tag.literal).map(([key, child]) => [key, expand(child, values, depth + 1)]));
    }
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, expand(child, values, depth + 1)]));
}
export const expandedData = (snapshot: any) => snapshot.observations.map((event: any) => ({ ...event.data, content: expand(event.data.content, snapshot.values) }));
