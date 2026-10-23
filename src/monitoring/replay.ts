import { CONTRACT, LIMITS, canonical, decode, freeze, sha256, validScope, type Body, type Bundle, type WireEvent } from "./contract.js";
import type { CallObservation, ExpectedScope, HandoffObservation, PermissionObservation, ReplayResult, ResultObservation, RevisionContext, RunObservations, Unknown } from "./domain.js";

const unknown = (reason: string): Unknown => ({ kind: "unknown", reason });
export function prefixDigest(bundle: Bundle): string { return sha256(new TextEncoder().encode(canonical(bundle))); }

export function validatedBundle(bytes: Uint8Array, expected: ExpectedScope): Bundle {
  if (!validScope(expected)) throw new Error("expected-scope");
  const bundle = decode(bytes);
  if (canonical(bundle.scope) !== canonical(expected)) throw new Error("scope-mismatch");
  const identities = new Map<string, string>();
  const events: WireEvent[] = [];
  for (const event of bundle.events) {
    const value = canonical(event);
    const prior = identities.get(event.id);
    if (prior !== undefined) {
      if (prior !== value) throw new Error("conflicting-identity");
      continue;
    }
    identities.set(event.id, value);
    if (event.seq !== events.length + 1 || event.id !== `${event.source}:${event.seq}`) throw new Error("event-order");
    events.push(event);
  }
  if (events.length > LIMITS.events) throw new Error("event-limit");
  let segment = 0;
  let source = "";
  let reporter = "";
  let phase: "closed" | "open" | "settled" = "closed";
  let previousClose: Extract<Body, { kind: "segment.closed" }>["reason"] | undefined;
  let notification = 0;
  let revision: string | null = null;
  let needsResumeGap = false;
  const sources = new Set<string>();
  for (const [index, event] of events.entries()) {
    const body = event.body;
    if (body.kind === "segment.opened") {
      if (phase !== "closed" || event.segment !== segment + 1 || sources.has(event.source)) throw new Error("segment-chain");
      if (body.nativeSessionId !== expected.nativeSessionId) throw new Error("scope-mismatch");
      if (segment === 0 ? body.previousBundle !== null : previousClose === "settled" || body.previousBundle !== prefixDigest({ contract: CONTRACT, scope: bundle.scope, events: events.slice(0, index) })) throw new Error("resume-prefix");
      segment = event.segment;
      source = event.source;
      reporter = body.reporter;
      sources.add(source);
      phase = "open";
      notification = 0;
      revision = null;
      needsResumeGap = segment > 1;
    } else {
      if (event.segment !== segment || event.source !== source || phase === "closed") throw new Error("source-segment");
      if (needsResumeGap && !(body.kind === "gap" && body.reason === "resume")) throw new Error("resume-gap");
      needsResumeGap = false;
      if (phase === "settled" && body.kind !== "segment.closed") throw new Error("after-settlement");
    }
    const kind = body.kind;
    const collector = kind === "segment.opened" || kind === "segment.closed" || kind === "gap";
    const reported = kind === "revision.reported" || kind === "permission.request.reported" || kind === "permission.response.reported";
    if (collector ? event.origin.kind !== "collector" : reported ? event.origin.kind !== "caller-report" || event.origin.reporter !== reporter : event.origin.kind !== "pi-sdk") throw new Error("provenance");
    if (event.origin.kind === "pi-sdk") {
      if (event.origin.notification <= notification) throw new Error("notification-order");
      notification = event.origin.notification;
    }
    if (body.kind === "revision.reported") revision = event.id;
    if (body.kind === "tool.dispatched") {
      if (body.revision !== revision) throw new Error("revision-reference");
      revision = null;
    }
    if (body.kind === "gap") {
      revision = null;
      if (body.reason === "resume") {
        if (index === 0 || events[index - 1]?.body.kind !== "segment.opened" || segment === 1) throw new Error("resume-gap");
      } else if (events[index + 1]?.body.kind !== "segment.closed") throw new Error("terminal-gap");
    }
    if (body.kind === "run.settled") phase = "settled";
    if (body.kind === "segment.closed") {
      const prior = events[index - 1]?.body;
      if (body.reason === "settled" || body.reason === "aborted") {
        if (prior?.kind !== "run.settled" || prior.aborted !== (body.reason === "aborted")) throw new Error("terminal-settlement");
      } else if (prior?.kind !== "gap" || prior.reason !== body.reason) throw new Error("terminal-gap");
      phase = "closed";
      previousClose = body.reason;
    }
  }
  if (phase !== "closed" || !previousClose) throw new Error("incomplete-export");
  return { ...bundle, events };
}

type Dispatch = WireEvent & { body: Extract<Body, { kind: "tool.dispatched" }> };
type Finished = WireEvent & { body: Extract<Body, { kind: "tool.finished" }> };
type Correlation = Unknown | { kind: "matched"; dispatch: Dispatch; result: Finished };
function key(event: WireEvent, nativeId: string): string { return JSON.stringify([event.segment, event.source, nativeId]); }

function derive(bundle: Bundle): RunObservations {
  const events = bundle.events;
  const byId = new Map(events.map((event) => [event.id, event]));
  const groups = new Map<string, { dispatches: Dispatch[]; results: Finished[] }>();
  for (const event of events) {
    if (event.body.kind !== "tool.dispatched" && event.body.kind !== "tool.finished") continue;
    const id = key(event, event.body.nativeCallId);
    const group = groups.get(id) ?? { dispatches: [], results: [] };
    if (event.body.kind === "tool.dispatched") group.dispatches.push({ ...event, body: event.body });
    else group.results.push({ ...event, body: event.body });
    groups.set(id, group);
  }
  const revisionOf = (dispatch: Dispatch): RevisionContext => {
    const revision = dispatch.body.revision ? byId.get(dispatch.body.revision) : undefined;
    return revision?.body.kind === "revision.reported"
      ? { kind: "reported-context-only", revision: revision.id, label: revision.body.label, files: revision.body.files }
      : unknown("no-issue-time-report");
  };
  const calls: CallObservation[] = [];
  const results: ResultObservation[] = [];
  const correlations = new Map<string, Correlation>();
  for (const [id, group] of groups) {
    const dispatch = group.dispatches[0];
    const result = group.results[0];
    let reason = "missing-dispatch";
    if (group.dispatches.length > 1 || group.results.length > 1) reason = "ambiguous-native-id";
    else if (dispatch && !result) reason = "missing-result";
    else if (dispatch && result) {
      if (result.seq < dispatch.seq) reason = "result-before-dispatch";
      else if (dispatch.body.toolName !== result.body.toolName) reason = "tool-name-mismatch";
      else if (dispatch.body.parentNativeCallId !== result.body.parentNativeCallId) reason = "parent-mismatch";
      else reason = "";
    }
    const correlation: Correlation = !reason && dispatch && result ? { kind: "matched", dispatch, result } : unknown(reason);
    correlations.set(id, correlation);
    for (const call of group.dispatches) {
      const parentId = call.body.parentNativeCallId;
      const parentGroup = parentId === null ? undefined : groups.get(key(call, parentId));
      const parent = parentGroup?.dispatches[0];
      calls.push({
        dispatch: call.id, nativeCallId: call.body.nativeCallId, toolName: call.body.toolName,
        parent: parentId === null ? { kind: "root" } : parent && parentGroup?.dispatches.length === 1 && parent.seq < call.seq ? { kind: "observed", dispatch: parent.id } : unknown("unobserved-parent"),
        association: correlation.kind === "matched" ? { kind: "matched", result: correlation.result.id } : correlation,
        revisionContext: revisionOf(call), executorRevision: "unavailable",
      });
    }
    for (const finished of group.results) {
      results.push({ result: finished.id, nativeCallId: finished.body.nativeCallId,
        association: correlation.kind === "matched" ? { kind: "matched", dispatch: correlation.dispatch.id } : correlation,
        revisionContext: correlation.kind === "matched" ? revisionOf(correlation.dispatch) : unknown("unmatched-result"), executorRevision: "unavailable" });
    }
  }
  calls.sort((a, b) => byId.get(a.dispatch)!.seq - byId.get(b.dispatch)!.seq);
  results.sort((a, b) => byId.get(a.result)!.seq - byId.get(b.result)!.seq);
  const permissions: PermissionObservation[] = [];
  const responses = events.filter((event) => event.body.kind === "permission.response.reported");
  const responseCounts = new Map<string, number>();
  for (const event of responses) {
    if (event.body.kind !== "permission.response.reported") continue;
    const id = key(event, event.body.request);
    responseCounts.set(id, (responseCounts.get(id) ?? 0) + 1);
  }
  for (const response of responses) {
    if (response.body.kind !== "permission.response.reported") continue;
    const body = response.body;
    const request = byId.get(body.request);
    const group = body.subject.kind === "call" ? groups.get(key(response, body.subject.nativeCallId)) : undefined;
    const dispatch = group?.dispatches[0];
    const matched = request?.body.kind === "permission.request.reported" && request.seq < response.seq
      && request.source === response.source && request.segment === response.segment
      && request.origin.kind === "caller-report" && response.origin.kind === "caller-report" && request.origin.reporter === response.origin.reporter
      && canonical(request.body.subject) === canonical(body.subject) && body.subject.kind === "call"
      && dispatch !== undefined && dispatch.seq < request.seq && dispatch.body.toolName === body.subject.toolName && dispatch.body.parentNativeCallId === body.subject.parentNativeCallId
      && group?.dispatches.length === 1 && group.results.length <= 1 && responseCounts.get(key(response, body.request)) === 1;
    const correlation = body.subject.kind === "call" ? correlations.get(key(response, body.subject.nativeCallId)) : undefined;
    permissions.push({ response: response.id, decision: body.decision,
      association: matched && request && dispatch ? { kind: "matched-report", request: request.id, dispatch: dispatch.id } : unknown("unmatched-permission-report"),
      timing: !matched || correlation?.kind !== "matched" ? "unknown" : correlation.result.seq < response.seq ? "after-result" : "reported-before-result",
      authorization: "unavailable" });
  }
  const candidates: Array<{ assistant: string; evidenceThrough: number }> = [];
  const handoffs: HandoffObservation[] = [];
  let active: { assistant: string; evidenceThrough: number; text: string } | undefined;
  let started = false;
  let completion: RunObservations["completion"] = "unknown";
  for (const event of events) {
    const body = event.body;
    switch (body.kind) {
      case "segment.opened": started = false; active = undefined; completion = "unknown"; break;
      case "agent.started": started = true; active = undefined; break;
      case "assistant.completed":
        active = undefined;
        if (started && body.stopReason === "stop" && body.declaredCalls.length === 0 && body.text.kind === "retained" && typeof body.text.value === "string" && body.text.value.trim()) {
          active = { assistant: event.id, evidenceThrough: event.seq - 1, text: body.text.value };
          candidates.push({ assistant: event.id, evidenceThrough: event.seq - 1 });
        }
        break;
      case "tool.dispatched":
      case "tool.finished":
      case "activity.boundary":
      case "gap":
      case "revision.reported": active = undefined; break;
      case "run.settled":
        completion = body.aborted ? "interrupted" : "settled";
        if (!body.aborted && active) handoffs.push({ ...active, settlement: event.id, boundary: "sdk-after-transforms-before-persistence" });
        active = undefined;
        break;
      case "segment.closed":
      case "permission.request.reported":
      case "permission.response.reported": break;
    }
  }
  return freeze({ scope: bundle.scope, events: events.map((event) => ({ id: event.id, sequence: event.seq, segment: event.segment, source: event.source, provenance: event.origin, authentication: event.authentication,
    observation: event.body.kind === "segment.opened" ? { kind: "segment.opened" as const, nativeSessionId: event.body.nativeSessionId } : event.body })),
    calls, results, permissions, candidates, handoffs, completion,
    coverage: ["authentication-unavailable", "executor-revision-unavailable", "complete-edit-history-unavailable", "native-permissions-unavailable", "human-receipt-unavailable", "task-success-unavailable", "silent-disposal-unavailable", "history-not-imported", "transcript-results-not-retained", "raw-activity-not-retained", "thinking-and-provider-metadata-not-retained"] });
}

export function replayCapture(bytes: Uint8Array, expected: ExpectedScope): ReplayResult {
  try { return { kind: "available", view: derive(validatedBundle(bytes, expected)) }; }
  catch (error) { return { kind: "unavailable", reason: error instanceof Error ? error.message : "invalid-bundle" }; }
}
