import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capturePiRun, replayCapture, type Capture, type ReportedObservation } from "../src/monitoring/index.js";
import { ScriptedHost } from "./fixtures/monitoring/scripted-host.js";

const scope = { taskId: "TENET-188", runId: "synthetic-run", nativeSessionId: "native-1" };
const options = { ...scope, reporter: "offline-driver" };
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const fixtureBytes = new Uint8Array(readFileSync(new URL("./fixtures/monitoring/settled.json", import.meta.url)));
interface FixtureEvent { id: string; seq: number; segment: number; source: string; origin: Record<string, unknown>; body: Record<string, unknown> }
interface Fixture { contract: string; scope: typeof scope; events: FixtureEvent[] }
const fixture = (): Fixture => JSON.parse(new TextDecoder().decode(fixtureBytes));

function view(bytes: Uint8Array, expected = scope) {
  const result = replayCapture(bytes, expected);
  if (result.kind !== "available") assert.fail(`Unavailable replay: ${result.reason}`);
  return result.view;
}
function report(capture: Capture, value: ReportedObservation): string {
  const result = capture.observe(value);
  if (result.kind !== "recorded") assert.fail(`Rejected report: ${result.reason}`);
  return result.eventId;
}
const subject = (nativeCallId = "check", toolName = "bash", parentNativeCallId: string | null = null) => ({ kind: "call" as const, nativeCallId, toolName, parentNativeCallId });
function request(capture: Capture, callSubject = subject()) {
  return report(capture, { kind: "permission.request.reported", subject: callSubject, request: "Run synthetic check" });
}
function response(capture: Capture, requestId: string, callSubject = subject()) {
  return report(capture, { kind: "permission.response.reported", request: requestId, subject: callSubject, decision: "allow" });
}

test("completed transformed output confirms a handoff without a later tool and preserves listeners", async () => {
  const host = new ScriptedHost();
  const capture = capturePiRun(host.source, options);
  const seen: string[] = [];
  let persistedAtCompletion = -1;
  host.subscribe((event) => { seen.push(event.type); if (event.type === "message_end") persistedAtCompletion = host.persisted.length; });
  host.emit({ type: "agent_start" });
  host.complete("before", "stop", () => ({ role: "assistant", content: [{ type: "text", text: "Transformed final answer" }], stopReason: "stop" }));
  host.emit({ type: "agent_end", messages: [], willRetry: false });
  host.emit({ type: "agent_settled", aborted: false });
  const bytes = capture.close();
  const result = view(bytes);
  assert.equal(result.completion, "settled");
  assert.deepEqual(result.handoffs.map((handoff) => ({ text: handoff.text, evidenceThrough: handoff.evidenceThrough, boundary: handoff.boundary })), [
    { text: "Transformed final answer", evidenceThrough: 2, boundary: "sdk-after-transforms-before-persistence" },
  ]);
  assert.deepEqual(seen, ["agent_start", "message_end", "agent_end", "agent_settled"]);
  assert.equal(persistedAtCompletion, 0);
  await Promise.resolve();
  assert.equal(host.listeners.length, 1);
  assert.deepEqual(capture.close(), bytes);
  assert.deepEqual(capture.observe({ kind: "revision.reported", label: "late", files: [] }), { kind: "rejected", reason: "closed" });
});

test("edit, check, later edit and retest keep only issue-time reported revision context", () => {
  const host = new ScriptedHost();
  const capture = capturePiRun(host.source, options);
  host.emit({ type: "agent_start" });
  host.dispatch("edit-a", "edit", { path: "src/example.ts", oldText: "a", newText: "b" });
  host.finish("edit-a", "edit");
  const files = [{ path: "src/example.ts", sha256: "a".repeat(64) }];
  report(capture, { kind: "revision.reported", label: "revision-A", files });
  files[0]!.sha256 = "c".repeat(64);
  host.dispatch("check-a");
  host.dispatch("edit-b", "write", { path: "src/example.ts", content: "c" });
  host.finish("edit-b", "write");
  report(capture, { kind: "revision.reported", label: "revision-B", files: [{ path: "src/example.ts", sha256: "b".repeat(64) }] });
  host.finish("check-a");
  host.dispatch("check-b");
  host.finish("check-b");
  host.dispatch("read-next", "read");
  host.finish("read-next", "read");
  host.complete("Retested revision B");
  host.emit({ type: "agent_settled", aborted: false });
  const result = view(capture.close());
  assert.deepEqual(result.calls.map((call) => ({ id: call.nativeCallId, association: call.association.kind, revision: call.revisionContext.kind === "reported-context-only" ? call.revisionContext.label : "unknown", executorRevision: call.executorRevision })), [
    { id: "edit-a", association: "matched", revision: "unknown", executorRevision: "unavailable" },
    { id: "check-a", association: "matched", revision: "revision-A", executorRevision: "unavailable" },
    { id: "edit-b", association: "matched", revision: "unknown", executorRevision: "unavailable" },
    { id: "check-b", association: "matched", revision: "revision-B", executorRevision: "unavailable" },
    { id: "read-next", association: "matched", revision: "unknown", executorRevision: "unavailable" },
  ]);
  const late = result.results.find((item) => item.nativeCallId === "check-a")!;
  assert.equal(late.revisionContext.kind === "reported-context-only" && late.revisionContext.files[0]?.sha256, "a".repeat(64));
  assert.equal(result.handoffs[0]?.text, "Retested revision B");
});

test("caller-known permission subjects match reports after dispatch but never grant authorization", () => {
  const host = new ScriptedHost();
  const capture = capturePiRun(host.source, options);
  host.dispatch("check");
  const requestId = request(capture);
  response(capture, requestId);
  host.finish("check");
  host.dispatch("late");
  const lateRequest = request(capture, subject("late"));
  host.finish("late");
  response(capture, lateRequest, subject("late"));
  const result = view(capture.close());
  assert.deepEqual(result.permissions.map((item) => ({ association: item.association.kind, timing: item.timing, authorization: item.authorization })), [
    { association: "matched-report", timing: "reported-before-result", authorization: "unavailable" },
    { association: "matched-report", timing: "after-result", authorization: "unavailable" },
  ]);
});

for (const scenario of ["pre-dispatch", "wrong-name", "wrong-parent", "duplicate-dispatch", "duplicate-response", "wrong-subject", "unknown-request"] as const) {
  test(`permission association stays unknown for ${scenario}`, () => {
    const host = new ScriptedHost();
    const capture = capturePiRun(host.source, options);
    if (scenario !== "pre-dispatch") host.dispatch("check");
    const callSubject = scenario === "wrong-name" ? subject("check", "read") : scenario === "wrong-parent" ? subject("check", "bash", "parent") : subject();
    const id = request(capture, callSubject);
    if (scenario === "pre-dispatch" || scenario === "duplicate-dispatch") host.dispatch("check");
    response(capture, scenario === "unknown-request" ? "not-observed" : id, scenario === "wrong-subject" ? subject("other") : callSubject);
    if (scenario === "duplicate-response") response(capture, id);
    host.finish("check");
    const result = view(capture.close());
    assert.deepEqual(result.permissions[0]?.association, { kind: "unknown", reason: "unmatched-permission-report" });
    assert.equal(result.permissions[0]?.authorization, "unavailable");
  });
}

for (const scenario of ["wrong-name", "wrong-parent", "duplicate-result"] as const) {
  for (const responseOrder of ["before", "after"] as const) {
    test(`permission timing stays unknown with ${scenario} result and response ${responseOrder}`, () => {
      const host = new ScriptedHost();
      const capture = capturePiRun(host.source, options);
      host.dispatch("check");
      const id = request(capture);
      if (responseOrder === "before") response(capture, id);
      host.finish("check", scenario === "wrong-name" ? "read" : "bash", scenario === "wrong-parent" ? "foreign-parent" : undefined);
      if (responseOrder === "after") response(capture, id);
      if (scenario === "duplicate-result") host.finish("check");
      const result = view(capture.close());
      const reason = scenario === "wrong-name" ? "tool-name-mismatch" : scenario === "wrong-parent" ? "parent-mismatch" : "ambiguous-native-id";
      assert.deepEqual(result.calls[0]?.association, { kind: "unknown", reason });
      assert.deepEqual(result.results[0]?.association, { kind: "unknown", reason });
      assert.deepEqual(result.permissions.map((item) => ({ association: item.association.kind, timing: item.timing, authorization: item.authorization })), [
        { association: scenario === "duplicate-result" ? "unknown" : "matched-report", timing: "unknown", authorization: "unavailable" },
      ]);
    });
  }
}

for (const scenario of ["early-result", "missing-result"] as const) {
  test(`permission subject still matches but timing stays unknown with ${scenario}`, () => {
    const host = new ScriptedHost();
    const capture = capturePiRun(host.source, options);
    if (scenario === "early-result") host.finish("check");
    host.dispatch("check");
    const id = request(capture);
    response(capture, id);
    const result = view(capture.close());
    assert.deepEqual(result.calls[0]?.association, { kind: "unknown", reason: scenario === "early-result" ? "result-before-dispatch" : "missing-result" });
    if (scenario === "early-result") assert.deepEqual(result.results[0]?.association, { kind: "unknown", reason: "result-before-dispatch" });
    else assert.deepEqual(result.results, []);
    assert.deepEqual(result.permissions.map((item) => ({ association: item.association.kind, timing: item.timing, authorization: item.authorization })), [
      { association: "matched-report", timing: "unknown", authorization: "unavailable" },
    ]);
  });
}

test("response before an early result cannot repair a pre-dispatch permission request", () => {
  const host = new ScriptedHost();
  const capture = capturePiRun(host.source, options);
  const id = request(capture);
  response(capture, id);
  host.finish("check");
  host.dispatch("check");
  const result = view(capture.close());
  assert.deepEqual(result.results[0]?.association, { kind: "unknown", reason: "result-before-dispatch" });
  assert.deepEqual(result.permissions.map((item) => ({ association: item.association, timing: item.timing, authorization: item.authorization })), [
    { association: { kind: "unknown", reason: "unmatched-permission-report" }, timing: "unknown", authorization: "unavailable" },
  ]);
});

for (const scenario of ["unmatched", "early", "name", "parent", "duplicate-dispatch", "duplicate-result", "missing-result"] as const) {
  test(`call/result correlation does not repair ${scenario}`, () => {
    const host = new ScriptedHost();
    const capture = capturePiRun(host.source, options);
    if (scenario === "early") host.finish("check");
    if (scenario !== "unmatched") host.dispatch("check");
    if (scenario === "duplicate-dispatch") host.dispatch("check");
    if (scenario !== "early" && scenario !== "missing-result") host.finish("check", scenario === "name" ? "read" : "bash", scenario === "parent" ? "parent" : undefined);
    if (scenario === "duplicate-result") host.finish("check");
    const result = view(capture.close());
    const reasons = { unmatched: "missing-dispatch", early: "result-before-dispatch", name: "tool-name-mismatch", parent: "parent-mismatch", "duplicate-dispatch": "ambiguous-native-id", "duplicate-result": "ambiguous-native-id", "missing-result": "missing-result" };
    assert.deepEqual((result.results[0] ?? result.calls[0])?.association, { kind: "unknown", reason: reasons[scenario] });
    assert.equal((result.results[0] ?? result.calls[0])?.executorRevision, "unavailable");
  });
}

test("nested parents use explicit earlier dispatches and transcript summaries create no results", () => {
  const host = new ScriptedHost();
  const capture = capturePiRun(host.source, options);
  host.dispatch("parent"); host.dispatch("child", "read", {}, "parent"); host.finish("child", "read", "parent");
  host.dispatch("orphan", "read", {}, "absent"); host.finish("orphan", "read", "absent");
  host.emit({ type: "message_end", message: { role: "toolResult", toolCallId: "parent", nestedCalls: { calls: [{ id: "invented", status: "ok" }], complete: true } } });
  const result = view(capture.close());
  assert.equal(result.calls[1]?.parent.kind, "observed");
  assert.deepEqual(result.calls[2]?.parent, { kind: "unknown", reason: "unobserved-parent" });
  assert.deepEqual(result.results.map((item) => item.nativeCallId), ["child", "orphan"]);
});

test("static fixture replays literal evidence and exact serialized retransmission is idempotent", () => {
  const result = view(fixtureBytes);
  assert.deepEqual(result.handoffs, [{ assistant: "fixture-source:6", settlement: "fixture-source:7", text: "Checked revision A", evidenceThrough: 5, boundary: "sdk-after-transforms-before-persistence" }]);
  assert.deepEqual(result.calls[0]?.association, { kind: "matched", result: "fixture-source:5" });
  const duplicate = fixture();
  const event = duplicate.events[3]!;
  duplicate.events.push(Object.fromEntries(Object.entries(event).reverse()) as unknown as FixtureEvent);
  assert.deepEqual(view(encode(duplicate)), result);
});

for (const scenario of ["conflict", "sequence-hole", "sequence-collision", "source", "segment", "version", "field", "reporter", "revision", "native"] as const) {
  test(`replay rejects invalid ${scenario}`, () => {
    const value = fixture();
    const event = value.events[3]!;
    if (scenario === "conflict") value.events.push({ ...event, body: { ...event.body, toolName: "other" } });
    if (scenario === "sequence-hole") value.events.splice(2, 1);
    if (scenario === "sequence-collision") event.seq = 3;
    if (scenario === "source") { event.source = "foreign"; event.id = "foreign:4"; }
    if (scenario === "segment") event.segment = 2;
    if (scenario === "version") value.contract = "v999";
    if (scenario === "field") event.body.extra = true;
    if (scenario === "reporter") value.events[2]!.origin.reporter = "foreign";
    if (scenario === "revision") event.body.revision = "fixture-source:6";
    if (scenario === "native") value.events[0]!.body.nativeSessionId = "foreign";
    assert.equal(replayCapture(encode(value), scope).kind, "unavailable");
  });
}
for (const field of ["taskId", "runId", "nativeSessionId"] as const) {
  test(`replay requires expected ${field}`, () => {
    assert.deepEqual(replayCapture(fixtureBytes, { ...scope, [field]: "foreign" }), { kind: "unavailable", reason: "scope-mismatch" });
  });
}

test("resume inherits task/run/native scope, inserts a gap, and never joins prior calls or permissions", () => {
  const first = new ScriptedHost();
  const capture = capturePiRun(first.source, options);
  first.dispatch("check");
  const id = request(capture);
  const prefix = capture.close();
  const next = new ScriptedHost();
  const resumed = capturePiRun(next.source, { ...options, resumeFrom: prefix });
  next.finish("check");
  response(resumed, id);
  next.emit({ type: "agent_start" }); next.complete("Resumed final"); next.emit({ type: "agent_settled", aborted: false });
  const bytes = resumed.close();
  const result = view(bytes);
  assert.deepEqual(result.results[0]?.association, { kind: "unknown", reason: "missing-dispatch" });
  assert.deepEqual(result.permissions[0]?.association, { kind: "unknown", reason: "unmatched-permission-report" });
  assert.deepEqual(result.events.filter((event) => event.observation.kind === "gap").map((event) => event.observation), [{ kind: "gap", reason: "detached" }, { kind: "gap", reason: "resume" }]);
  assert.equal(result.handoffs[0]?.text, "Resumed final");
  assert.deepEqual(result.events.slice(0, view(prefix).events.length), view(prefix).events);
  const corrupt: Fixture = JSON.parse(new TextDecoder().decode(bytes));
  corrupt.events[1]!.body.toolName = "changed";
  assert.deepEqual(replayCapture(encode(corrupt), scope), { kind: "unavailable", reason: "resume-prefix" });
  assert.throws(() => capturePiRun(new ScriptedHost().source, { ...options, resumeFrom: bytes }), /resume-not-incomplete/);
  const foreign = new ScriptedHost(); foreign.sessionId = "foreign";
  assert.throws(() => capturePiRun(foreign.source, { ...options, nativeSessionId: "foreign", resumeFrom: prefix }), /scope-mismatch/);
  assert.throws(() => capturePiRun(new ScriptedHost().source, { ...options, runId: "foreign", resumeFrom: prefix }), /scope-mismatch/);
});

test("abort is interrupted and can resume but missing start never establishes a handoff", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  host.emit({ type: "agent_start" }); host.complete("Aborted"); host.emit({ type: "agent_settled", aborted: true });
  const prefix = capture.close();
  assert.equal(view(prefix).completion, "interrupted");
  assert.deepEqual(view(prefix).handoffs, []);
  const next = new ScriptedHost(); const resumed = capturePiRun(next.source, { ...options, resumeFrom: prefix });
  next.complete("No observed start"); next.emit({ type: "agent_settled", aborted: false });
  assert.deepEqual(view(resumed.close()).handoffs, []);
});

test("sources cannot be reused and equal native labels do not join independent runs", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  host.dispatch("same"); capture.close();
  assert.throws(() => capturePiRun(host.source, options), /source-already-owned/);
  const alias = new ScriptedHost(); alias.agent = host.agent;
  assert.throws(() => capturePiRun(alias.source, options), /source-already-owned/);
  const next = new ScriptedHost(); const independent = capturePiRun(next.source, { ...options, runId: "second" });
  next.finish("same");
  assert.deepEqual(view(independent.close(), { ...scope, runId: "second" }).results[0]?.association, { kind: "unknown", reason: "missing-dispatch" });
  const busy = new ScriptedHost(); busy.isIdle = false;
  assert.throws(() => capturePiRun(busy.source, options), /source-not-idle/);
});

for (const identity of ["session", "agent"] as const) {
  test(`mutated ${identity} identity closes capture without importing foreign content`, () => {
    const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
    host.emit({ type: "agent_start" });
    if (identity === "session") host.sessionId = "foreign"; else host.agent = {};
    host.complete("Foreign text must not enter");
    const result = view(capture.close());
    assert.deepEqual(result.events.map((event) => event.observation), [{ kind: "segment.opened", nativeSessionId: "native-1" }, { kind: "agent.started" }, { kind: "gap", reason: "source-changed" }, { kind: "segment.closed", reason: "source-changed" }]);
  });
}

for (const badFinal of ["error", "length", "aborted", "toolUse", "pending", "deferred", "empty", "omitted", "calls"] as const) {
  test(`latest ${badFinal} output cannot confirm an older clean candidate`, () => {
    const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
    host.emit({ type: "agent_start" }); host.complete("Old clean output");
    if (badFinal === "calls") host.complete("Tool intent", "stop", () => ({ role: "assistant", content: [{ type: "text", text: "Tool intent" }, { type: "toolCall", id: "call", name: "bash", arguments: {} }], stopReason: "stop" }));
    else host.complete(badFinal === "empty" ? "  " : badFinal === "omitted" ? "x".repeat(9000) : "New output", ["empty", "omitted"].includes(badFinal) ? "stop" : badFinal);
    host.emit({ type: "agent_settled", aborted: false });
    const result = view(capture.close());
    assert.deepEqual(result.handoffs, []);
    assert.equal(result.candidates[0]?.evidenceThrough, 2);
  });
}

test("late result invalidates a candidate without changing its cutoff and a later output can qualify", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  host.emit({ type: "agent_start" }); host.dispatch("check"); host.complete("Too early"); host.finish("check");
  host.complete("Final after result"); host.emit({ type: "agent_settled", aborted: false });
  const result = view(capture.close());
  assert.deepEqual(result.candidates.map((item) => item.evidenceThrough), [3, 5]);
  assert.deepEqual(result.handoffs.map((item) => ({ text: item.text, cutoff: item.evidenceThrough })), [{ text: "Final after result", cutoff: 5 }]);
});

test("retry and actual continuation invalidate the prior output", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  host.emit({ type: "agent_start" }); host.complete("Before retry");
  host.emit({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 0, errorMessage: "private metadata not retained" });
  host.emit({ type: "agent_end", messages: [], willRetry: false }); host.emit({ type: "agent_settled", aborted: false });
  const result = view(capture.close());
  assert.deepEqual(result.handoffs, []);
  assert.deepEqual(result.events[3]?.observation, { kind: "activity.boundary", activity: "retry" });
});

for (const success of [true, false]) {
  test(`boolean retry success ${success} after completed output preserves settlement semantics`, () => {
    const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
    host.emit({ type: "agent_start" }); host.complete("Completed retry output");
    host.emit({ type: "auto_retry_end", success, attempt: 1 });
    host.emit({ type: "agent_settled", aborted: false });
    const result = view(capture.close());
    assert.equal(result.completion, "settled");
    assert.deepEqual(result.handoffs.map((item) => ({ text: item.text, cutoff: item.evidenceThrough })), success ? [{ text: "Completed retry output", cutoff: 2 }] : []);
    assert.deepEqual(result.events.filter((event) => event.observation.kind === "activity.boundary").map((event) => event.observation), success ? [] : [{ kind: "activity.boundary", activity: "retry" }]);
  });
}

for (const success of ["false", 1, null, undefined]) {
  test(`nonboolean retry success ${String(success)} seals unknown completion and preserves listeners`, async () => {
    const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
    const seen: string[] = []; host.subscribe((event) => { seen.push(event.type); });
    host.emit({ type: "agent_start" }); host.complete("Candidate before malformed retry end");
    host.emit({ type: "auto_retry_end", success, attempt: 1 });
    host.emit({ type: "agent_settled", aborted: false });
    const bytes = capture.close(); const result = view(bytes);
    assert.equal(result.completion, "unknown");
    assert.deepEqual(result.handoffs, []);
    assert.deepEqual(result.events.slice(-2).map((event) => event.observation), [{ kind: "gap", reason: "normalization-error" }, { kind: "segment.closed", reason: "normalization-error" }]);
    assert.deepEqual(seen, ["agent_start", "message_end", "auto_retry_end", "agent_settled"]);
    await Promise.resolve(); assert.equal(host.listeners.length, 1);
    assert.deepEqual(capture.close(), bytes);
  });
}

test("reentrant close freezes immediately but does not skip current live-array listeners", async () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  const seen: string[] = []; let sealed: Uint8Array | undefined;
  host.subscribe((event) => { if (event.type === "message_end") sealed = capture.close(); });
  host.subscribe((event) => { seen.push(event.type); });
  host.emit({ type: "agent_start" }); host.complete("Reentrant close"); host.dispatch("ignored");
  assert.deepEqual(seen, ["agent_start", "message_end", "tool_execution_start"]);
  assert.deepEqual(capture.close(), sealed);
  assert.equal(view(capture.close()).completion, "unknown");
  assert.deepEqual(view(capture.close()).events.at(-1)?.observation, { kind: "segment.closed", reason: "detached" });
  await Promise.resolve(); assert.equal(host.listeners.length, 2);
});

test("malformed SDK notifications end capture without throwing through listeners", async () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  const seen: string[] = []; host.subscribe((event) => { seen.push(event.type); });
  host.emit({ type: "tool_execution_end", toolCallId: "bad", toolName: "bash", result: {}, isError: "not-a-boolean" });
  assert.deepEqual(seen, ["tool_execution_end"]);
  assert.deepEqual(view(capture.close()).events.at(-2)?.observation, { kind: "gap", reason: "normalization-error" });
  await Promise.resolve(); assert.equal(host.listeners.length, 1);
});

test("mutable, cyclic, unsupported, deep, oversized and UTF-8 payloads are copied or explicitly omitted", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  const mutable = { command: "original" }; host.dispatch("mutable", "bash", mutable); mutable.command = "changed";
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  host.dispatch("cycle", "bash", cycle);
  host.dispatch("unsupported", "bash", { value: 1n });
  let deep: unknown = "bottom"; for (let i = 0; i < 18; i++) deep = { nested: deep };
  host.dispatch("deep", "bash", deep);
  host.dispatch("nodes", "bash", Array(3000).fill(1));
  host.dispatch("size", "bash", "x".repeat(8191));
  host.dispatch("utf8-exact", "bash", "é".repeat(4095));
  host.dispatch("utf8-over", "bash", "é".repeat(4096));
  const observations = view(capture.close()).events.flatMap((event) => event.observation.kind === "tool.dispatched" ? [event.observation.declaredInput] : []);
  assert.deepEqual(observations.slice(0, 6), [{ kind: "retained", value: { command: "original" } }, { kind: "omitted", reason: "cycle" }, { kind: "omitted", reason: "unsupported" }, { kind: "omitted", reason: "depth" }, { kind: "omitted", reason: "nodes" }, { kind: "omitted", reason: "size" }]);
  assert.deepEqual(observations[6], { kind: "retained", value: "é".repeat(4095) });
  assert.deepEqual(observations[7], { kind: "omitted", reason: "size" });
});

test("reports reject malformed values and identity drift before accepting caller data", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  for (const malformed of [{ kind: "revision.reported", label: "bad", files: [{ path: "x", sha256: "bad" }] }, { kind: "other" }, { kind: "revision.reported", label: "x".repeat(300), files: [] }]) {
    assert.deepEqual(capture.observe(malformed as ReportedObservation), { kind: "rejected", reason: "invalid-report" });
  }
  host.sessionId = "foreign";
  assert.deepEqual(capture.observe({ kind: "revision.reported", label: "not imported", files: [] }), { kind: "rejected", reason: "source-changed" });
  assert.deepEqual(view(capture.close()).events.at(-1)?.observation, { kind: "segment.closed", reason: "source-changed" });
});

test("event limit reserves terminal capacity, preserves sentinel delivery and cannot reset on resume", async () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  let seen = 0; host.subscribe(() => { seen++; });
  for (let i = 0; i < 4100; i++) host.emit({ type: "turn_start" });
  const bytes = capture.close(); const result = view(bytes);
  assert.equal(seen, 4100);
  assert.equal(result.events.length, 4096);
  assert.deepEqual(result.events.slice(-2).map((item) => item.observation), [{ kind: "gap", reason: "limit" }, { kind: "segment.closed", reason: "limit" }]);
  assert.throws(() => capturePiRun(new ScriptedHost().source, { ...options, resumeFrom: bytes }), /resume-budget-exhausted/);
  await Promise.resolve(); assert.equal(host.listeners.length, 1);
});

test("bundle and segment limits remain run-wide across disconnected resumes", () => {
  let bytes = capturePiRun(new ScriptedHost().source, options).close();
  for (let i = 1; i < 16; i++) bytes = capturePiRun(new ScriptedHost().source, { ...options, resumeFrom: bytes }).close();
  assert.equal(view(bytes).events.at(-1)?.segment, 16);
  assert.throws(() => capturePiRun(new ScriptedHost().source, { ...options, resumeFrom: bytes }), /resume-budget-exhausted/);
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  for (let i = 0; i < 700; i++) host.dispatch(String(i), "bash", "x".repeat(8000));
  bytes = capture.close();
  assert.equal(bytes.byteLength <= 4 * 1024 * 1024, true);
  assert.deepEqual(view(bytes).events.at(-1)?.observation, { kind: "segment.closed", reason: "limit" });
  assert.throws(() => capturePiRun(new ScriptedHost().source, { ...options, resumeFrom: bytes }), /resume-budget-exhausted/);
});

test("replay bounds bytes, nesting, schema and UTF-8 before admitting evidence", () => {
  for (const bytes of [new Uint8Array(4 * 1024 * 1024 + 1), new Uint8Array([255]), new TextEncoder().encode("not-json"), encode({ ...fixture(), events: [] })]) {
    assert.equal(replayCapture(bytes, scope).kind, "unavailable");
  }
  const value = fixture(); let deep: unknown = null; for (let i = 0; i < 40; i++) deep = [deep];
  value.events[3]!.body.declaredInput = { kind: "retained", value: deep };
  assert.equal(replayCapture(encode(value), scope).kind, "unavailable");
  assert.equal(view(fixtureBytes).completion, "settled");
});

test("valid run-wide traversal remains replayable when many bounded payloads accumulate", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  for (let i = 0; i < 200; i++) host.dispatch(`dense-${i}`, "bash", Array(1600).fill(null));
  const result = view(capture.close());
  assert.equal(result.calls[199]?.nativeCallId, "dense-199");
  assert.deepEqual(result.calls[199]?.association, { kind: "unknown", reason: "missing-result" });
});

test("array and object payloads retain the exact JSON UTF-8 byte boundary", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  host.dispatch("array", "bash", ["x".repeat(8188)]);
  host.dispatch("object", "bash", { x: "x".repeat(8184) });
  host.dispatch("object-over", "bash", { x: "x".repeat(8185) });
  const result = view(capture.close()).events.flatMap((event) => event.observation.kind === "tool.dispatched" ? [event.observation.declaredInput] : []);
  assert.deepEqual(result, [{ kind: "retained", value: ["x".repeat(8188)] }, { kind: "retained", value: { x: "x".repeat(8184) } }, { kind: "omitted", reason: "size" }]);
});

test("reentrant close during normalization cannot append after the frozen terminal state", async () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  let sealed: Uint8Array | undefined; let seen = 0;
  host.subscribe(() => { seen++; });
  host.emit({ type: "tool_execution_start", toolCallId: "closing", toolName: "bash", get args() { sealed = capture.close(); return {}; } });
  assert.equal(seen, 1);
  assert.deepEqual(capture.close(), sealed);
  assert.deepEqual(view(capture.close()).events.map((event) => event.observation.kind), ["segment.opened", "gap", "segment.closed"]);
  await Promise.resolve(); assert.equal(host.listeners.length, 1);
});

test("accessor payloads are omitted without executing getters or mutating host values", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  let invoked = 0;
  const args = { get dangerous() { invoked++; throw new Error("must not execute"); } };
  host.dispatch("accessor", "bash", args);
  const result = view(capture.close());
  assert.equal(invoked, 0);
  assert.deepEqual(result.events[1]?.observation.kind === "tool.dispatched" && result.events[1].observation.declaredInput, { kind: "omitted", reason: "unsupported" });
  assert.equal(Object.getOwnPropertyDescriptor(args, "dangerous")?.get instanceof Function, true);
});

test("late results without replacement output cannot enter an earlier handoff cutoff", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  host.emit({ type: "agent_start" }); host.complete("Too soon"); host.finish("late"); host.emit({ type: "agent_settled", aborted: false });
  const result = view(capture.close());
  assert.equal(result.candidates[0]?.evidenceThrough, 2);
  assert.deepEqual(result.handoffs, []);
  assert.deepEqual(result.results[0]?.association, { kind: "unknown", reason: "missing-dispatch" });
});

test("all permission decisions remain reports and later repeated native IDs remove certainty", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  for (const decision of ["allow", "deny", "cancel"] as const) {
    host.dispatch(decision);
    const id = request(capture, subject(decision));
    report(capture, { kind: "permission.response.reported", request: id, subject: subject(decision), decision });
    host.finish(decision);
  }
  host.dispatch("allow");
  const permissions = view(capture.close()).permissions;
  assert.deepEqual(permissions.map((item) => ({ decision: item.decision, association: item.association.kind, authorization: item.authorization })), [
    { decision: "allow", association: "unknown", authorization: "unavailable" },
    { decision: "deny", association: "matched-report", authorization: "unavailable" },
    { decision: "cancel", association: "matched-report", authorization: "unavailable" },
  ]);
});

test("export and replay are immutable copies and omit private host metadata", () => {
  const host = new ScriptedHost(); const capture = capturePiRun(host.source, options);
  host.emit({ type: "agent_start" });
  host.complete("Visible", "stop", () => ({ role: "assistant", content: [{ type: "thinking", thinking: "private-thought" }, { type: "text", text: "Visible", textSignature: "private-signature" }], provider: "private-provider", stopReason: "stop" }));
  host.emit({ type: "agent_settled", aborted: false });
  const bytes = capture.close(); bytes.fill(0);
  const result = view(capture.close());
  assert.equal(result.handoffs[0]?.text, "Visible");
  assert.equal(Object.isFrozen(result.events[2]?.observation), true);
  const text = new TextDecoder().decode(capture.close());
  assert.equal(text.includes("private-"), false);
  assert.equal(text.includes("nativeEntryId"), false);
});
