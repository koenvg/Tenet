import { createHash } from "node:crypto";
import Type, { type Static, type TProperties } from "typebox";
import { Check } from "typebox/value";

export const CONTRACT = "tenet-monitoring-events-v1";
export const LIMITS = { events: 4096, segments: 16, payloadBytes: 8192, bundleBytes: 4 * 1024 * 1024, labelBytes: 256, depth: 16, payloadNodes: 2048, terminalBytes: 8192 } as const;
const object = <T extends TProperties>(properties: T) => Type.Object(properties, { additionalProperties: false });
const tag = <T extends string>(value: T) => Type.Literal(value);
const label = Type.String({ minLength: 1, maxLength: LIMITS.labelBytes });
const nullableLabel = Type.Union([label, Type.Null()]);
const digest = Type.String({ pattern: "^[a-f0-9]{64}$" });
const integer = Type.Integer({ minimum: 1, maximum: LIMITS.events });
const subject = Type.Union([
  object({ kind: tag("call"), nativeCallId: label, toolName: label, parentNativeCallId: nullableLabel }),
  object({ kind: tag("unknown"), reason: tag("no-call-reference") }),
]);
export const PayloadSchema = Type.Union([
  object({ kind: tag("retained"), value: Type.Unknown() }),
  object({ kind: tag("omitted"), reason: Type.Union([tag("size"), tag("depth"), tag("nodes"), tag("unsupported"), tag("cycle")]) }),
]);
export const ReportSchema = Type.Union([
  object({ kind: tag("revision.reported"), label, files: Type.Array(object({ path: label, sha256: digest }), { maxItems: 128 }) }),
  object({ kind: tag("permission.request.reported"), subject, request: label }),
  object({ kind: tag("permission.response.reported"), request: label, subject, decision: Type.Union([tag("allow"), tag("deny"), tag("cancel")]) }),
]);
const activity = Type.Union([
  tag("turn-start"), tag("message-start"), tag("message-update"), tag("other-message"), tag("tool-update"), tag("retry"), tag("compaction"), tag("queue"), tag("external-bash"), tag("entry"), tag("configuration"),
]);
const closeReason = Type.Union([tag("settled"), tag("aborted"), tag("detached"), tag("limit"), tag("source-changed"), tag("normalization-error")]);
const gapReason = Type.Union([tag("resume"), tag("detached"), tag("limit"), tag("source-changed"), tag("normalization-error")]);
export const BodySchema = Type.Union([
  object({ kind: tag("segment.opened"), nativeSessionId: label, reporter: label, previousBundle: Type.Union([digest, Type.Null()]) }),
  object({ kind: tag("agent.started") }),
  object({ kind: tag("assistant.completed"), text: PayloadSchema, stopReason: Type.Union([tag("pending"), tag("stop"), tag("length"), tag("toolUse"), tag("error"), tag("aborted"), tag("deferred")]), declaredCalls: Type.Array(object({ nativeCallId: label, toolName: label, declaredInput: PayloadSchema }), { maxItems: 128 }) }),
  object({ kind: tag("tool.dispatched"), nativeCallId: label, toolName: label, parentNativeCallId: nullableLabel, declaredInput: PayloadSchema, revision: nullableLabel }),
  object({ kind: tag("tool.finished"), nativeCallId: label, toolName: label, parentNativeCallId: nullableLabel, result: PayloadSchema, isError: Type.Boolean(), durationMs: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]) }),
  object({ kind: tag("activity.boundary"), activity }),
  object({ kind: tag("run.settled"), aborted: Type.Boolean() }),
  object({ kind: tag("gap"), reason: gapReason }),
  object({ kind: tag("segment.closed"), reason: closeReason }),
  ReportSchema,
]);
const origin = Type.Union([
  object({ kind: tag("pi-sdk"), hostVersion: tag("1.3.0"), notification: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }) }),
  object({ kind: tag("caller-report"), reporter: label }),
  object({ kind: tag("collector") }),
]);
export const ScopeSchema = object({ taskId: label, runId: label, nativeSessionId: label });
export const EventSchema = object({ id: label, seq: integer, segment: Type.Integer({ minimum: 1, maximum: LIMITS.segments }), source: label, origin, authentication: tag("unavailable"), body: BodySchema });
const BundleSchema = object({ contract: tag(CONTRACT), scope: ScopeSchema, events: Type.Array(EventSchema, { minItems: 2, maxItems: LIMITS.events * 2 }) });
export type Body = Static<typeof BodySchema>;
export type Report = Static<typeof ReportSchema>;
export type Payload = Static<typeof PayloadSchema>;
export type Scope = Static<typeof ScopeSchema>;
export type WireEvent = Static<typeof EventSchema>;
export type Bundle = Static<typeof BundleSchema>;
export type CloseReason = Static<typeof closeReason>;
export type GapReason = Static<typeof gapReason>;

export function encode(value: unknown): Uint8Array { return new TextEncoder().encode(JSON.stringify(value)); }
export function sha256(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

class Omission extends Error {
  constructor(readonly reason: "size" | "depth" | "nodes" | "unsupported" | "cycle") { super(reason); }
}

function snapshot(value: unknown, maxBytes: number, maxDepth: number, maxNodes: number): unknown {
  const ancestors = new Set<object>();
  let nodes = 0;
  let bytes = 0;
  const visit = (input: unknown, depth: number): unknown => {
    if (++nodes > maxNodes) throw new Omission("nodes");
    if (depth > maxDepth) throw new Omission("depth");
    if (typeof input === "string") {
      if (input.length > maxBytes) throw new Omission("size");
      bytes += Buffer.byteLength(JSON.stringify(input));
    } else if (input === null || typeof input === "boolean" || typeof input === "number" && Number.isFinite(input)) {
      bytes += String(input).length;
    } else if (typeof input === "object" && input !== null) {
      if (ancestors.has(input)) throw new Omission("cycle");
      if (!Array.isArray(input) && Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) throw new Omission("unsupported");
      if (Reflect.ownKeys(input).length > maxNodes) throw new Omission("nodes");
      const descriptors = Object.getOwnPropertyDescriptors(input);
      if (Object.getOwnPropertySymbols(input).length) throw new Omission("unsupported");
      ancestors.add(input);
      bytes += 2;
      let result: unknown;
      if (Array.isArray(input)) {
        if (input.length > maxNodes) throw new Omission("nodes");
        const array: unknown[] = [];
        for (let i = 0; i < input.length; i++) {
          const item = descriptors[String(i)];
          if (!item || !("value" in item)) throw new Omission("unsupported");
          if (i) bytes++;
          array.push(visit(item.value, depth + 1));
        }
        if (Object.keys(descriptors).length !== input.length + 1) throw new Omission("unsupported");
        result = array;
      } else {
        const record: Record<string, unknown> = Object.create(null);
        let first = true;
        for (const [key, item] of Object.entries(descriptors)) {
          if (!("value" in item) || !item.enumerable) throw new Omission("unsupported");
          if (key.length > maxBytes) throw new Omission("size");
          bytes += Buffer.byteLength(JSON.stringify(key)) + (first ? 1 : 2);
          first = false;
          record[key] = visit(item.value, depth + 1);
        }
        result = record;
      }
      ancestors.delete(input);
      if (bytes > maxBytes) throw new Omission("size");
      return result;
    } else throw new Omission("unsupported");
    if (bytes > maxBytes) throw new Omission("size");
    return input;
  };
  return visit(value, 0);
}

export function payload(value: unknown): Payload {
  try { return { kind: "retained", value: snapshot(value, LIMITS.payloadBytes, LIMITS.depth, LIMITS.payloadNodes) }; }
  catch (error) { return { kind: "omitted", reason: error instanceof Omission ? error.reason : "unsupported" }; }
}

export function parseReport(value: unknown): Report | undefined {
  try {
    const copy = snapshot(value, LIMITS.payloadBytes, LIMITS.depth, LIMITS.payloadNodes);
    return Check(ReportSchema, copy) && labelsFit(copy) ? copy : undefined;
  } catch { return undefined; }
}
export function validScope(value: unknown): value is Scope { return Check(ScopeSchema, value) && labelsFit(value); }
function labelsFit(value: unknown): boolean {
  if (typeof value === "string") return Buffer.byteLength(value) <= LIMITS.labelBytes;
  if (value === null || typeof value !== "object") return true;
  return Object.values(value).every(labelsFit);
}
export function validEvent(event: unknown): event is WireEvent {
  if (!Check(EventSchema, event)) return false;
  if (event.origin.kind === "caller-report" && !parseReport(event.body)) return false;
  const inspect = (value: unknown): boolean => {
    if (value === null || typeof value !== "object") return typeof value !== "string" || Buffer.byteLength(value) <= LIMITS.labelBytes;
    const record = value as Record<string, unknown>;
    if (record.kind === "retained") {
      try { snapshot(record.value, LIMITS.payloadBytes, LIMITS.depth, LIMITS.payloadNodes); return true; } catch { return false; }
    }
    return Object.values(record).every(inspect);
  };
  return inspect(event);
}
export function decode(bytes: Uint8Array): Bundle {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > LIMITS.bundleBytes) throw new Error("bundle-size");
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  snapshot(value, LIMITS.bundleBytes, LIMITS.depth + 8, LIMITS.bundleBytes);
  if (!Check(BundleSchema, value) || !validScope(value.scope)) throw new Error("schema");
  if (!value.events.every(validEvent)) throw new Error("schema");
  return value;
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
