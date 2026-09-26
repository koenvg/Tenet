// Inspect host JSON without copying it or invoking accessors. This is an admission
// preflight, not a substitute for captureAction's strict evidence validation.
export function evidenceWithinBudget(values: readonly unknown[], limit: number): boolean {
  let bytes = 0, nodes = 0;
  const seen = new WeakSet<object>();
  const charge = (amount: number) => { bytes += amount; return bytes <= limit; };
  const string = (value: string) => {
    if (value.length > limit - bytes) return false;
    let size = Buffer.byteLength(value, 'utf8') + 2;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code < 32) size += 5; // Worst-case JSON escape (\\u00xx).
      else if (code === 34 || code === 92) size++;
      else if (code >= 0xd800 && code <= 0xdfff) size += 3; // Lone surrogate escape.
      if (size > limit - bytes) return false;
    }
    return charge(size);
  };
  const pending = values.map(value => ({ value, depth: 0 }));
  try {
    while (pending.length) {
      const { value, depth } = pending.pop()!;
      if (++nodes > 4096 || depth > 64) return false;
      if (typeof value === 'string') { if (!string(value)) return false; continue; }
      if (value === null || typeof value === 'boolean' || typeof value === 'number' || value === undefined) {
        if (!charge(32)) return false; continue;
      }
      if (typeof value !== 'object') continue; // captureAction rejects non-JSON values.
      if (seen.has(value)) return false; // Shared subtrees can expand exponentially when copied.
      seen.add(value);
      if (Array.isArray(value)) {
        if (value.length > 4096 || !charge(value.length + 2)) return false;
        for (let i = 0; i < value.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
          if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
          pending.push({ value: descriptor.value, depth: depth + 1 });
        }
      } else {
        if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) continue; // captureAction rejects it.
        if (!charge(2)) return false;
        for (const key in value) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor) continue;
          if (!Object.hasOwn(descriptor, 'value') || !string(key) || !charge(2)) return false;
          pending.push({ value: descriptor.value, depth: depth + 1 });
          if (pending.length + nodes > 4096) return false;
        }
      }
    }
  } catch { return false; }
  return true;
}
