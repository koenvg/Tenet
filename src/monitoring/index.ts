import { randomUUID } from "node:crypto";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { CONTRACT, LIMITS, encode, parseReport, validEvent, validScope, type Body, type Bundle, type CloseReason, type GapReason, type WireEvent } from "./contract.js";
import type { Capture, ExpectedScope, ObserveResult } from "./domain.js";
import { project } from "./pi-observations.js";
import { prefixDigest, validatedBundle } from "./replay.js";

export { replayCapture } from "./replay.js";
export type { Capture, ExpectedScope, ReportedObservation, ObserveResult, ReplayResult, RunObservations, ObservedEvent, Observation, CallObservation, ResultObservation, RevisionContext, PermissionObservation, HandoffObservation, RetainedPayload, Unknown } from "./domain.js";

const owned = new WeakSet<object>();
export function capturePiRun(session: AgentSession, options: ExpectedScope & { readonly reporter: string; readonly resumeFrom?: Uint8Array }): Capture {
  const scope = { taskId: options.taskId, runId: options.runId, nativeSessionId: options.nativeSessionId };
  const reporter = options.reporter;
  if (!validScope(scope) || typeof reporter !== "string" || !reporter || Buffer.byteLength(reporter) > LIMITS.labelBytes) throw new Error("invalid-options");
  const agent = session.agent;
  if (!agent || typeof agent !== "object" || session.sessionId !== scope.nativeSessionId || !session.isIdle) throw new Error("source-not-idle-or-scope-mismatch");
  if (owned.has(session) || owned.has(agent)) throw new Error("source-already-owned");
  const bundle: Bundle = options.resumeFrom ? validatedBundle(options.resumeFrom, scope) : { contract: CONTRACT, scope, events: [] };
  const previous = bundle.events.at(-1);
  if (previous && (previous.body.kind !== "segment.closed" || previous.body.reason === "settled")) throw new Error("resume-not-incomplete");
  const segment = (previous?.segment ?? 0) + 1;
  if (segment > LIMITS.segments || bundle.events.length > LIMITS.events - 5 || encode(bundle).length > LIMITS.bundleBytes - LIMITS.terminalBytes * 2) throw new Error("resume-budget-exhausted");
  const previousBundle = previous ? prefixDigest(bundle) : null;
  const source = randomUUID();
  let state: { kind: "open" } | { kind: "closed"; bytes: Uint8Array } = { kind: "open" };
  let unsubscribe: (() => void) | undefined;
  let revision: string | null = null;
  let notification = 0;
  let usedBytes = encode(bundle).length;
  const makeEvent = (body: Body, origin: WireEvent["origin"]): WireEvent => ({
    id: `${source}:${bundle.events.length + 1}`, seq: bundle.events.length + 1, segment, source, origin, authentication: "unavailable", body,
  });
  const append = (body: Body, origin: WireEvent["origin"]): WireEvent => {
    const event = makeEvent(body, origin);
    bundle.events.push(event);
    usedBytes += encode(event).length + 1;
    return event;
  };
  const terminate = (reason: CloseReason, gap?: GapReason) => {
    if (state.kind === "closed") return;
    if (gap) append({ kind: "gap", reason: gap }, { kind: "collector" });
    append({ kind: "segment.closed", reason }, { kind: "collector" });
    state = { kind: "closed", bytes: encode(bundle) };
    // Pi 1.3.0 iterates a live listener array. Splicing here skips the next listener.
    queueMicrotask(() => { try { unsubscribe?.(); } catch {} });
  };
  const identityMatches = (): boolean => {
    try { return session.agent === agent && session.sessionId === scope.nativeSessionId; }
    catch { return false; }
  };
  const checkSource = (): boolean => {
    if (state.kind === "closed") return false;
    if (identityMatches()) return state.kind === "open";
    terminate("source-changed", "source-changed");
    return false;
  };
  const record = (body: Body, origin: WireEvent["origin"]): WireEvent | undefined => {
    if (state.kind === "closed") return undefined;
    const event = makeEvent(body, origin);
    if (!validEvent(event)) throw new Error("normalization-error");
    if (bundle.events.length >= LIMITS.events - 2 || usedBytes + encode(event).length + 1 > LIMITS.bundleBytes - LIMITS.terminalBytes) {
      terminate("limit", "limit");
      return undefined;
    }
    return append(body, origin);
  };
  append({ kind: "segment.opened", nativeSessionId: scope.nativeSessionId, reporter, previousBundle }, { kind: "collector" });
  if (previous) append({ kind: "gap", reason: "resume" }, { kind: "collector" });
  owned.add(session);
  owned.add(agent);
  try {
    unsubscribe = session.subscribe((event) => {
      try {
        if (!checkSource()) return;
        const number = ++notification;
        const body = project(event, revision);
        if (!checkSource() || !body) return;
        const observed = record(body, { kind: "pi-sdk", hostVersion: "1.3.0", notification: number });
        if (!observed) return;
        if (body.kind === "tool.dispatched") revision = null;
        if (body.kind === "run.settled") terminate(body.aborted ? "aborted" : "settled");
      } catch { terminate("normalization-error", "normalization-error"); }
    });
  } catch {
    terminate("normalization-error", "normalization-error");
  }
  return {
    observe(value): ObserveResult {
      if (state.kind === "closed") return { kind: "rejected", reason: "closed" };
      if (!checkSource()) return { kind: "rejected", reason: "source-changed" };
      const body = parseReport(value);
      if (!body) return { kind: "rejected", reason: "invalid-report" };
      if (!checkSource()) return { kind: "rejected", reason: "closed" };
      const event = record(body, { kind: "caller-report", reporter });
      if (!event) return { kind: "rejected", reason: "limit" };
      if (body.kind === "revision.reported") revision = event.id;
      return { kind: "recorded", eventId: event.id };
    },
    close() {
      if (state.kind === "open") {
        checkSource();
        terminate("detached", "detached");
      }
      if (state.kind !== "closed") throw new Error("capture-not-closed");
      return state.bytes.slice();
    },
  };
}
