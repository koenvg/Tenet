# Monitoring event capture

This reference is for developers who need bounded observations of one Pi task and run. It covers the experimental checkout-only adapter in `src/monitoring/index.ts` for Pi 1.3.0. It is not a package export or an installed extension.

The adapter observes a supplied idle `AgentSession`, accepts caller reports, and exports bytes for deterministic replay. It does not create a session, prompt a provider, discover owner configuration, read history, or interpret expectations.

## Check the public boundary offline

Prerequisites are an existing checkout with its locked dependencies and the runtimes listed in [Contributing](../CONTRIBUTING.md#set-up). These checks do not install dependencies or construct a real Pi session.

1. From the repository root, enter the [disposable focused-check shell](../CONTRIBUTING.md#run-focused-checks-in-a-clean-shell). This excludes inherited credentials, policies, runtime hooks, and owner configuration. It is not a sandbox against deliberate filesystem access.
2. Run the synthetic public-boundary tests:

   ```sh
   bun --no-env-file --no-install test test/monitoring-adapter.test.ts --isolate --max-concurrency=1 --timeout=30000
   ```

3. Compile the public consumer against the pinned SDK declarations:

   ```sh
   bun --no-env-file --no-install ./node_modules/typescript/bin/tsc -p tsconfig.monitoring-check.json --noEmit
   ```

4. Run focused lint:

   ```sh
   ./node_modules/.bin/oxlint --deny-warnings src/monitoring test/monitoring-adapter.test.ts test/fixtures/monitoring
   ```

Each command must exit zero. The test command reports passing tests and no failures. The compile-only consumer never executes.

Missing modules mean the checkout prerequisites are absent, not that the adapter passed. Do not install dependencies as part of this check without separate authorization.

`test/fixtures/monitoring/settled.json` is synthetic retained evidence. `scripted-host.ts` reproduces the pinned listener-array behavior and message transformation before notification, followed by persistence.

Tests assert literal observations through `capturePiRun`, `observe`, `close`, and `replayCapture`. They do not import private reducers or schemas. These checks do not prove provider connectivity or active production hooks.

## Public API

Only `src/monitoring/index.ts` is the supported import boundary in this checkout. Internal schemas and SDK projection functions are not public APIs.

Capture can retain secrets in visible text, declared arguments, and reported paths. Export does not redact all secret-bearing data and is not safe to publish by default. The caller must control access to retained bytes.

| Operation | Contract |
| --- | --- |
| `capturePiRun(session, options)` | Attaches to the supplied idle Pi 1.3.0 `AgentSession`. Required options are `taskId`, `runId`, `nativeSessionId`, and `reporter`. Optional `resumeFrom` contains an earlier terminal export. Invalid attachment or resume throws before returning a capture. |
| `capture.observe(report)` | Copies a revision or permission report. Returns `recorded` with its collector `eventId`, or `rejected` with a reason. It does not request or grant permission. |
| `capture.close()` | Seals an open capture with a disconnected gap and returns `Uint8Array` bytes. Already sealed captures return identical bytes in a new array. Closing does not abort or dispose the host. |
| `replayCapture(bytes, expectedScope)` | Requires the expected task, run, and native session IDs. Returns `available` with immutable domain observations, or `unavailable` with a reason. |

`available` means that replay admitted a bounded observation document for the expected scope. It does not mean complete coverage, authenticated execution, permission, a passing check, or a successful task.

Settlement, capture limits, source drift, and normalization failure seal capture synchronously. Unsubscribe runs in a microtask after dispatch. Notifications received after sealing cannot change the export.

The pinned SDK iterates a live listener array, so immediate self-unsubscribe could skip another listener. Deferred unsubscribe preserves that listener's current notification.

## Identity, provenance, and order

Task and run IDs are caller labels. The native session ID is a consistency check, not proof of task ownership. All observations have `authentication: "unavailable"`.

A parent-session link, a fresh-context request, or a digest cannot authenticate the run.

Capture pins the supplied session object, its underlying `agent`, and its native session ID. It rechecks available identity before accepting notifications or reports and after notification projection. Drift seals capture with a `source-changed` gap without importing the foreign notification.

Silent disposal has no general SDK signal. Coverage remains unknown until explicit close.

One process-local ownership guard rejects reuse of either the session object or the agent object, even after close. It is not a persistent registry and cannot detect separately created objects that happen to carry equal labels.

One ordered event sequence is authoritative. Every domain event has a collector ID, a contiguous sequence number, a segment, a source nonce, and one of these provenance classes:

- `pi-sdk` records the pinned host version and notification number.
- `caller-report` records the supplied reporter label.
- `collector` records capture boundaries and gaps.

Order means observer delivery order, not wall-clock causality. The adapter does not invent native entry IDs or import existing transcript entries. `agent.started` establishes an observed start only within its segment.

Replay compares repeated event IDs by canonical JSON value. Object key order does not matter. Array order and values do.

Identical serialized deliveries are idempotent before sequence validation. Conflicting deliveries, sequence collisions or holes, undeclared sources, incorrect segment chains, unknown fields, and unsupported versions are unavailable. Distinct live notifications always receive distinct collector IDs, even if their content repeats.

## Tools, edits, and revision context

A `tool.dispatched` observation records the native call ID, tool name, explicit parent identity, declared arguments, and the preceding reported revision reference. The pinned tool-start event precedes validation, blocking, permission handling, and execution. Dispatch does not prove invocation.

A `tool.finished` observation records the pipeline's visible text after result hooks, error flag, and optional nonnegative duration. A present duration reports that the pinned pipeline reached `execute()`. It does not prove external success, permission, edits, or which bytes a check used.

Tool-result details, images, usage, and later transcript-result copies are not retained.

Replay joins a result only to exactly one earlier dispatch with the same native call ID, tool name, parent identity, source, and segment. Missing calls, early results, mismatched names or parents, and repeated native IDs remain unknown.

Distinct repeated dispatches or results are ambiguity, not delivery duplicates. A missing explicit nested parent leaves ancestry unknown. Transcript summaries never create missing calls or results.

`revision.reported` contains a caller-selected label and file list. Each file has a path and a lowercase SHA-256 string. The adapter does not read those files, compute their digests, inspect Git, or observe complete external edits.

Named `edit` and `write` calls describe attempted activity, not proven file history.

At every dispatch, capture freezes the latest preceding revision report as context only. It then invalidates the current context, including after read tools. Another dispatch needs another report to inherit context.

Matched results use their dispatch's frozen context, never the latest report at result time. `executorRevision` remains `unavailable`.

```text
report A -> dispatch check -> report B -> late result
                |                           |
                +------ context A ----------+
```

The late result cannot claim to have tested B. An unmatched or ambiguous result has unknown revision context.

## Reported permissions

Native semantic permission receipts are unavailable. Permission inputs are caller reports and never execution authority.

A request supplies a short `request` string and either an unknown subject or a caller-known call subject. A response supplies the request's returned collector event ID, the same subject, and `allow`, `deny`, or `cancel`. The subject shape is:

```ts
const subject = {
	kind: "call" as const,
	nativeCallId: "synthetic-check",
	toolName: "bash",
	parentNativeCallId: null,
};
```

These are illustrative synthetic values, not a request to execute a tool. `null` explicitly means a root call. An unknown subject is `{ kind: "unknown", reason: "no-call-reference" }`.

The caller does not need a collector dispatch ID before export. Replay resolves the request's subject only against one earlier dispatch in that request's source and segment.

A pre-dispatch request remains valid reported evidence with unknown call association. Later calls cannot repair it. Later repeated native IDs remove certainty from affected associations.

A matched response requires the earlier request, identical subject, reporter, source, and segment. Duplicate responses are ambiguous. Unknown or foreign references remain unknown.

Reporter labels are fixed by capture, not supplied per report.

`reported-before-result` records observed report order only. A response after dispatch is not automatically late because dispatch precedes permission handling. `after-result` cannot establish prior permission.

Neither timing establishes decision-before-execution or authorization. Every derived permission has `authorization: "unavailable"`.

## Handoff and completion

A handoff is observed completed visible assistant output followed by non-aborted Pi settlement. It is not human receipt, task success, or proof that a check passed.

A candidate requires an observed start in the segment and the latest completed assistant message with retained nonempty text, `stopReason: "stop"`, and no declared tool calls. SDK completion occurs after extension message transforms and before message persistence. The collector ID identifies that observation, not a persisted native entry.

Each candidate retains `evidenceThrough`, the sequence number immediately before its completed-message observation. That cutoff never moves. A later result cannot enter the earlier evidence interval.

Later tool activity, message activity, continuation, retry, compaction, a revision report, or a gap invalidates the active candidate. An empty, omitted, errored, aborted, deferred, or otherwise unclean latest output cannot fall back to an older clean candidate.

Routine `turn_end` and non-retrying `agent_end` do not invalidate it. Only a later clean output can create a new candidate.

Non-aborted `agent_settled` confirms the still-active candidate without requiring another tool call. Aborted settlement yields `interrupted`, not a handoff. Early close yields `unknown`.

Completion `settled` describes the host boundary even when handoff is unknown. Capture detaches at settlement so a later prompt cannot enter the sealed run.

## Resume and gaps

Explicit resume accepts only a valid incomplete or aborted export, the exact inherited task and run labels, and the same native session ID on a newly supplied idle source object. Settled exports cannot resume. A changed native session needs a new run.

Supplying matching labels without `resumeFrom` starts an independent collection, not a continuation.

Resume preserves the prior observations, adds a new source and segment, and records a disconnected gap. Call, permission, revision, and output associations do not cross segments. The new segment needs its own observed start before handoff can qualify.

Run-wide event, byte, and segment budgets do not reset.

The private segment chain stores a SHA-256 digest of the canonical preceding bundle after duplicate delivery removal. Canonicalization sorts object keys and preserves array order. This detects changes relative to retained prefix content.

The digest is not a signature and cannot prevent a caller from fabricating a new document and recomputing hashes.

## Bounds and failure behavior

The `tenet-monitoring-events-v1` contract has fixed limits:

| Limit | Value |
| --- | --- |
| Unique events per run | 4,096 |
| Serialized delivery rows before deduplication | 8,192 |
| Segments per run | 16 |
| Complete UTF-8 bundle | 4 MiB |
| Retained payload or whole caller report, encoded as JSON | 8 KiB |
| IDs, labels, paths, and request strings | 256 UTF-8 bytes |
| Payload nesting below its root | 16 levels |
| Payload or report traversal | 2,048 values and at most 2,048 own properties per container |
| Selected files or assistant content blocks | 128 |
| Reserved terminal capacity | Two events and 8 KiB |

Replay checks byte size before parsing, then bounds traversal at 24 levels and 4,194,304 values before schema validation. Resume reserves space for a new segment and terminal records before attachment. Limits can therefore reject a resume before the final byte is used.

Retained values are callback-time copies. Cyclic, unsupported, overly deep, or oversized values become explicit omissions. Unsupported values include accessors, symbols, nonfinite numbers, non-JSON objects, and sparse arrays.

Omissions contain a reason, not a fabricated original byte count or digest. Omitted text cannot qualify as a handoff.

A run limit records a terminal gap and closes capture rather than silently dropping an observation and continuing. Invalid caller reports return `invalid-report` without appending.

Unexpected SDK projection failures record `normalization-error` and seal capture. Callback failures do not escape into host dispatch.

## Unsupported coverage

Capture is volatile. Process death before export loses the unexported observations. Storage and access controls belong to the caller.

This adapter deliberately omits thinking, signatures, system prompts, startup blocks, provider metadata, raw activity metadata, transcript-result duplication, tool-result details, images, native history, and parent links. Activity categories can invalidate output without retaining those details.

No Pi-only observation here establishes authenticated task ownership, exact executor revision, complete edit history, universal permission answers, uninterrupted continuity, human receipt, or task success. There is no enforcement, expectation interpretation, UI, app integration, append protocol, tailer, or historical admission path.
