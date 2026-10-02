import type { Observation } from './contracts.js';

export type ObservationEnvelope = Omit<Observation, 'data'>;
type Captured = { status: 'captured'; envelope: ObservationEnvelope; data: unknown }
  | { status: 'invalid' | 'oversized' };

/** Capture only own data descriptors. Never spread, serialize or freeze host objects. */
export function ownHistoryFields(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    const fields: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && !('value' in descriptor)) return null;
      fields[key] = descriptor?.value;
    }
    return fields;
  } catch { return null; }
}

export function historySlot(values: readonly unknown[], index: number): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch { return undefined; }
}

/** Primitive identity validation is shared by live, SDK and raw-trajectory admission.
 * Identity is never excerpted: if its envelope cannot fit, omit the entire event.
 */
export function captureObservation(value: unknown, maxBytes: number): Captured {
  const fields = ownHistoryFields(value, ['sessionId', 'callId', 'toolName', 'origin', 'timestamp', 'data']);
  if (!fields) return { status: 'invalid' };
  const { sessionId, callId, toolName, origin, timestamp, data } = fields;
  if (typeof sessionId !== 'string' || typeof origin !== 'string'
    || !(callId === null || typeof callId === 'string') || !(toolName === null || typeof toolName === 'string')
    || !(timestamp === null || typeof timestamp === 'number' && Number.isFinite(timestamp))) return { status: 'invalid' };
  // A length check bounds allocation before the exact serialized UTF-8 measurement.
  if ([sessionId, callId, toolName, origin].some(value => typeof value === 'string' && value.length > maxBytes)) return { status: 'oversized' };
  const envelope = { sessionId, callId, toolName, origin, timestamp };
  if (Buffer.byteLength(JSON.stringify({ ...envelope, data: null }), 'utf8') > maxBytes) return { status: 'oversized' };
  return { status: 'captured', envelope, data };
}
