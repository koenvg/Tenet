# Alpha embedding SDK

Use `createGuard` from `tenet` to check tool calls in your application. This guide covers the supported compiled SDK in a developer checkout or production archive. It starts with an offline check, then gives the API and host contracts.

Use Node 22.12+ or Bun 1.3.14+. `SDK_VERSION` is `alpha-1`. Breaking API changes are allowed during alpha.

Import only `tenet`, not `src/`, runtime classes, queues or recording readers. Claude Code remains an unverified prototype.

## Start with an offline session

This supported SDK example checks session setup and permission handling. It creates a temporary directory without a policy, so the session is dormant. It makes no TypeSafe requests and does not test policy assessment or host hooks.

1. Install the production archive and its dependencies, or build a developer checkout as described below. Keep the complete `dist/` tree and package manifest together.
2. In the Tenet package root, save this as `sdk-start.mjs`. In your own application, install the built Tenet directory as a dependency and save it in that application's root instead.

   ```js
   import { mkdtemp, rm } from 'node:fs/promises';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { createGuard } from 'tenet';

   const cwd = await mkdtemp(join(tmpdir(), 'tenet-start-'));
   const guard = createGuard({
     host: 'my-app',
     env: { TENET_RECORDING: 'off' },
     controlPath: join(cwd, 'control.json'),
   });
   try {
     const identity = { sessionId: 'start', contextId: 'main' };
     const session = guard.openSession(identity, cwd);
     const status = await session.ready;
     const call = { callId: 'call-1', toolName: 'read', input: { path: 'note.txt' } };
     const result = await session.beforeTool({
       ...call,
       current: () => ({ ...identity, ...call }),
     });
     console.log(status.state, result.permission, result.assessment.status);
   } finally {
     await guard.close();
     await rm(cwd, { recursive: true, force: true });
   }
   ```

3. Run it from the same directory:

   ```sh
   node sdk-start.mjs
   ```

Expected output:

```text
dormant released not-requested
```

No policy means no assessment in this example. `released` is permission, not evidence that a tool ran. No executor is called, and no host capabilities are declared.

A real host must reread its live invocation in `current()`, not reuse this fixed sample object.

If `tenet` cannot be imported, check the package installation or run the checkout build. A state other than `dormant` means the setup did not match the isolated example.

## Build and run offline

The repository-only [scripted host example](https://github.com/koenvg/Tenet/blob/main/examples/sdk.ts) exercises ready, dormant, uninitialized and unavailable sessions, pending observe permission, late counterfactual BLOCK, matched execution, trusted approval and off.

It uses temporary paths and an injected judge, with no production credential. These assertions test mechanics, not evaluator accuracy.

1. For a developer checkout, use Bun 1.3.14+ and Node 22.19+. Complete the repository-only [development setup](https://github.com/koenvg/Tenet/blob/main/CONTRIBUTING.md#set-up).
2. From the repository root, run:

   ```sh
   bun run sdk:example
   ```

The script builds the SDK and example, then runs the example under Node. Success exits zero and prints:

```text
SDK example passed: ready, dormant, uninitialized, unavailable, pending, counterfactual, execution, approval and off.
```

The archive does not ship `examples/`, source or development scripts. Do not run `sdk:example` there. Use the starting example above with its compiled SDK.

For checkout builds and focused checks, run these from the repository root after development setup:

```sh
bun run sdk:build
node -e "import('tenet').then(m => console.log(m.SDK_VERSION))"
bun -e "import('tenet').then(m => console.log(m.SDK_VERSION))"
bun test test/sdk-contract.test.ts test/sdk-consumer.test.ts
bun run typecheck
```

Both import checks print `alpha-1`. The build produces ESM and declarations in `dist/` and compiles the scripted host. After building, you can also run it with `node examples/dist/sdk.js` or `bun examples/dist/sdk.js`.

A local-package consumer needs no Pi, Svelte, inspector assets or source transpilation. The TypeSafe production dependency is needed only for the normal live judge.

The production archive includes ESM, declarations and a production dependency lock. It does not publish a package or change owner installations. Archive installation is documented in the repository-only [archive installation guide](https://github.com/koenvg/Tenet/blob/main/docs/INSTALL-ARCHIVE.md); the delivered archive has that guide as its root `README.md`.

## Choose an integration detail

After the offline example, use only the reference your host needs:

- [Construction options](#exports-and-construction) and [session methods](#session-contract).
- [Host capabilities](#host-obligations-and-approval), [fresh dispatch permission](#dispatch-only-from-fresh-permission) and [trusted approval](#obtain-trusted-approval).
- [History admission](#admit-bounded-untrusted-history), [owner callbacks](#keep-owner-events-out-of-agent-history) and [disposal](#revalidate-and-close).
- [Coverage diagnostics](#runtime-coverage-diagnostics) or [capture status](#recording-status).

Read [disclosure before use](#disclosure-before-use) before enabling live assessment or local capture in an eligible session.

## Host and Tenet responsibilities

```text
Host native call, identity, original arguments and cancellation
  |
  v
Tenet beforeTool: capture -> assess -> revalidate -> permission
  |                                      ^
  |                                      | trusted host approval UI
  v
Host dispatches unchanged call only when permission is released
  |
  v
Host observed result -> Tenet afterTool -> owner-only execution report
```

The host owns native events, transcript parsing, trusted UI and executor dispatch. Tenet owns policy parsing, evidence capture, assessment validation, deterministic consequences and authorization checks.

The diagram shows enforce-mode ordering. Observe releases after capture and assesses in the background. The SDK also owns provider construction, control watches, observation scheduling and local archive disposal. Pi uses this same compiled entry and session handles; there is no second policy engine.

A judge can be wrong. An assessment does not grant permission, and permission does not prove execution. Tenet does not install host hooks, freeze a host executor after release or provide a filesystem sandbox.

## Disclosure before use

By default, opening an eligible session enables local capture. Assessed calls submit rule text, tool arguments, metadata and bounded recent host observations to TypeSafe.

Live use sends this data to an external service and uses API quota. Obtain separate authorization before live evaluation. Source and secrets can remain in submitted strings and recordings despite field redaction.

Default capture lives in `~/.tenet/recordings`; cooperative owner control lives in `~/.tenet/control.json`. Set `TENET_RECORDING=off` before construction to disable local capture. This does not stop provider disclosure.

Owner control `off` stops new assessment and capture, but does not erase old archives or recall dispatched work.

Imports and guard construction create no files, watches or provider requests. An eligible initialized session starts control observation. The provider is constructed lazily only on an assessment request. Dormant sessions produce no evidence or owner events.

Mode is fixed at construction, with observe as the default. Observe does not block execution. `setActivation('on')` restores configured operation; it does not select enforcement or improve host coverage.

## Exports and construction

The runtime exports are `createGuard` and `SDK_VERSION`. The public type exports are:

```text
EvidenceContext, Judge, JudgeRequest, Assessment, RuleAssessment, Policy,
Action, Outcome, Json, Approval, ApprovalRequest, ActionResolver, ActionFacts,
ActionBinding, ResolvedAction, OperationSemantics, RecordingSink, Mode,
HistoryCaptureMetadata, Activation, Capabilities, Capability, SessionIdentity,
CurrentInvocation, ToolInvocation, ToolResult, Execution, ObservedHistory,
RuleDiagnostic, AssessmentStatus, BeforeToolResult, SessionStatus, OwnerReport,
OwnerRecord, OwnerEvent, GuardOptions, GuardSession, CaptureStatus, GuardStatus,
Guard
```

This is a name list, not a copyable import. The shipped `dist/sdk/index.d.ts` and `dist/sdk/types.d.ts` give the exact TypeScript declarations. Repository-only [SDK types](https://github.com/koenvg/Tenet/blob/main/src/sdk/types.ts) provide the same reference for checkout readers.

`createGuard(options: GuardOptions): Guard` requires only `host`. Other options are:

| Option | Contract |
| --- | --- |
| `capabilities` | Optional readonly list of host guarantees, described below. Omission is an empty list. |
| `hostVersion`, `hostProfile`, `limitations` | Verified host metadata and additional limitations. Omitted version/profile report `null`. |
| `env` | Complete environment object. Omission takes a snapshot of `process.env`; later environment changes do not reconfigure the guard. |
| `judge`, `createJudge` | Inject a `Judge`, or construct one lazily with `createJudge`. The normal live judge uses `TYPESAFE_API_KEY`. |
| `actionResolver` | Trusted, executing-tool-bound resolver. Omission leaves resolution unsupported. |
| `controlPath` | Absolute isolated control path for tests, or shared owner control path. Takes precedence over `TENET_CONTROL_PATH`. |
| `bindRecording` | Caller-owned best-effort sink instead of the local archive. External health and disposal remain the caller's responsibility. |
| `onOwnerEvent`, `onOwnerRecord` | Local, bounded, owner-only callbacks. Never route their data into agent history or evaluator evidence. |
| `observationLimits` | Optional overrides for `running`, `waiting`, `bytes`, `ageMs`. Defaults are two, 32, 1 MiB and 5000 ms. |
| `disposalTimeoutMs` | Safe integer from 0 to 5000 ms. Default 1000 ms. Invalid values throw `invalid-disposal-timeout`. |

## Host obligations and approval

Capabilities are guarantees your application provides, not switches that implement them. The SDK copies declarations at construction. Later list changes cannot upgrade coverage. Unknown names, duplicates and the old boolean-object form are rejected.

| Capability | Host guarantee |
| --- | --- |
| `interception` | Tools pass through `beforeTool` before execution, and the host respects permission. |
| `result-correlation` | Each result identifies the exact invocation that produced it. |
| `lifecycle-invalidation` | The host forwards cancellation and material session/context changes. |
| `argument-stability` | Checked arguments remain unchanged through executor dispatch. |
| `trusted-approval` | A trusted owner UI can confirm this invocation. A per-call `approve` callback is still required. |

`session.status().capabilities` gives supported/unsupported booleans and action-resolution status. Recordings retain that report. Undeclared interception does not turn assessment off; it means the SDK cannot claim that the host intercepts every applicable call. Choosing enforce does not authenticate facts or upgrade coverage.

Without `actionResolver`, resolution stays unsupported. Stock Pi has no authenticated resolver. See the repository-only [resolver contract](https://github.com/koenvg/Tenet/blob/main/docs/action-resolution.md) for implementing one.

Register it in trusted code, never from tool input, history or an environment setting. Facts must describe the pending executor operation. The executor must preserve that checked operation through dispatch or reject changes itself.

## Session contract

`guard.openSession(identity: SessionIdentity, cwd: string): GuardSession` returns a handle immediately. `cwd` must be absolute. Session and context IDs must be nonempty strings of at most 256 characters.

Invalid values throw `invalid-session-identity-or-cwd`. An already open session ID throws `session-already-open`. Opening after guard closure throws `guard-closed`.

One handle owns one host session and context. Close it before replacing that context. Each session selects its own policy from its cwd and never borrows another session's policy.

| Method or property | Use |
| --- | --- |
| `ready: Promise<SessionStatus>` | Await initialization. Before it resolves, enforce withholds permission; observe releases with an unavailable assessment. |
| `beforeTool(invocation: ToolInvocation): Promise<BeforeToolResult>` | Request fresh permission for this call. Required fields are `callId`, `toolName`, `input`, `current`. Optional fields are lazy `metadata`, `signal`, `approve`. |
| `afterTool(result: ToolResult): Execution` | Forward an observed result with `callId`, `toolName` and optional `content`, `details`, `isError`. Missing/unmatched results or omitted result correlation stay unknown. |
| `setHistory(history: readonly ObservedHistory[], capture?: HistoryCaptureMetadata): void` | Replace bounded untrusted tool observations. See history admission below. |
| `endTurn(): void` | Mark unmatched releases unknown. Valid background observations survive; pending enforcement is invalidated. |
| `invalidate(reason: string): void` | Revoke pending authorization and background observations for this context. |
| `status(): SessionStatus` | Read a frozen snapshot of state, identity, mode, activation, capabilities, policy and assessment identities. |
| `close(): Promise<boolean>` | Revoke this session, prevent further assessed calls and drain local writes within the deadline. Repeated close is safe. |

Call IDs must be unique for the session's lifetime, including retries. `callId` and `toolName` must be nonempty strings of at most 256 characters. Forward original arguments, not field-redacted evaluator evidence.

`current()` must reread live session/context/call identity, tool name and arguments before release. Forward native cancellation in `signal` and invalidate material context/session changes.

A confirmed absent local `TENET.md` without `TENET_POLICY` is dormant. An explicit missing policy, malformed policy, invalid configuration or missing judge credential is unavailable. Status distinguishes `uninitialized`, `ready`, `dormant`, `unavailable` and `closed`, separately from activation and configured mode.

Dormant and off releases have `bypassReason` and `assessment.status: 'not-requested'`, never an ALLOW assessment. Unavailable observe releases have no would-decision. Enforce waits for current assessment and required consent. WARN diagnostics remain advisory.

### Dispatch only from fresh permission

This integration sketch uses application-owned functions. It is not a standalone example. Use it in the host's native pre-tool handler after session initialization; use the scripted host above for an executable offline example. Call `endTurn()` only at native turn end.

```ts
import { type CurrentInvocation } from 'tenet';

const result = await session.beforeTool({
  callId: nativeCallId,
  toolName: originalToolName,
  input: originalArguments,
  signal: nativeCancellation,
  current: (): CurrentInvocation => rereadNativeInvocation(),
});
if (result.permission === 'released') {
  // Dispatch this same invocation with unchanged original arguments.
  const actualResult = await dispatchNativeInvocation();
  session.afterTool(actualResult);
}
// At native turn end, call session.endTurn().
```

Never dispatch from `wouldDecision`, `status`, a cached result, an owner event or the ASK label. Await a fresh `beforeTool` result for every invocation and retry. Authorization is not a reusable token. Preserve assessed arguments through dispatch, or declare argument stability unsupported. Checks before hook release cannot freeze the executor afterwards.

Public result/status fields, owner events and nested data are readonly frozen snapshots. A before-tool result has `permission: 'released' | 'blocked'`, `reason`, optional `blockReason`, `bypassReason` and `invocationId`, `assessment`, and `execution: 'unknown'`. Later events do not revise it.

Narrow `assessment.status` to `completed` to read its required `wouldDecision`. `not-requested`, `pending`, `unavailable`, `dropped` and `cancelled` exclude a would-decision. A completed ASK can be blocked or released after trusted approval. An unavailable observe assessment can accompany release. Missing evidence is not a passing assessment.

Pi declares interception, lifecycle invalidation and trusted approval. It does not declare result correlation or post-hook argument stability. Pi forwards result content as untrusted history, but new SDK-backed Pi execution records remain `unknown`, even for successful or failed native results.

Offline smoke-test executor counts and arguments prove what ran in those tests; permission or transcript IDs cannot certify production execution. Historical archives and native reports keep their recorded outcomes.

### Obtain trusted approval

Include `trusted-approval` in `capabilities` and supply an invocation-local `approve(request)` callback. Call `await request.valid()` immediately before displaying trusted UI. Bind the displayed policy, tool, argument digest and rule IDs to that request. Respect its abort signal and deadline.

Return `approved` only for explicit positive owner consent. Other `Approval` values are `denied-or-dismissed`, `unavailable`, `cancelled`, `timeout`, `invalidated` and `ui-error`. Agent messages, history and host permission settings are not consent.

The SDK bounds approval wait even if the UI ignores abort. Late confirmation cannot release cancelled, closed, stale or changed work. The host still owns UI disposal and dialog serialization. Do not overlap an unacknowledged cancelled dialog with a later one.

### Observe without blocking

Observe releases after bounded snapshot capture without awaiting the judge. Background work defaults to two running, 32 waiting, 1 MiB total snapshots and five-second queue age. Terminal owner assessment events distinguish completed, unavailable, dropped and cancelled work. Pending, dropped and unavailable work has no passing assessment.

`guard.status()` reports `closed`, session count, mode, activation, aggregate `observations` queue health and configured `capture` destination. Neither queue health nor capture status guarantees complete interception or durable recording.

## Runtime coverage diagnostics

`EvidenceContext` is an exported readonly type carried by new assessment results and owner events/reports. Completed preparation copies resolution status and limitations, redaction and final retained/omitted history counts from the immutable request. It does not add evaluator rationale, authenticate facts or authorize execution.

A provider failure can have completed preparation and an unavailable assessment. Pending and early failures use unavailable preparation and null final history counters. Historical owner reports may omit the field.

| Identity | Current value |
| --- | --- |
| Diagnostic | `evidence-context-v1` |
| History selection | `bounded-history-v2` |
| Questions | `policy-rules-v7-ordinary-evidence` |
| Assessment | `applicability-v1` |

Completed v2 history includes effective history/event byte allowances, shortened events, selector-dropped events, prior capture omissions and exact-compacted bytes. Defaults cap complete history at 8 KiB and each event's data at 2 KiB. Shortening loses content; it is not lossless compaction.

Exact-compacted bytes measure net serialized savings for the same retained snapshot. They include complete sanitized string references, a local pool and reference/pool overhead. Runtime excerpt fragments stay inline, so identical oversized originals can have zero savings.

Every event and its provenance stays distinct. Literal reference lookalikes are escaped untrusted data.

Only final submitted snapshot counters reach owner reports. Historical v2 inline records keep zero as recorded. New archives use schema 4. Historical v1 diagnostics keep their recorded identities and lack v2 counters.

Live owner delivery works with `TENET_RECORDING=off`. Read `event.assessment.evidenceContext` on terminal observe events; the earlier pending result stays immutable.

Coverage and model UNKNOWN/INSUFFICIENT outcomes are separate facts. Do not infer why the model chose them, treat complete history as complete effects or dispatch from coverage. See repository-only [diagnostic provenance and bounds](https://github.com/koenvg/Tenet/blob/main/docs/inspection-evidence.md#runtime-evidence-context).

## Recording status

Check `guard.status().capture.kind` before reading health fields. `CaptureStatus` describes configuration, not whether capture is active now. Check guard `closed`, activation and session readiness separately.

| `kind` | Meaning | Fields |
| --- | --- | --- |
| `local-archive` | Local archive configured on. | `directory`, optional `issue`, measured `failed`, `dropped`, `written`, `pending`, `drainTimeouts`. |
| `disabled` | Local recording off or configuration invalid. | Same local fields; invalid configuration includes an `issue`. |
| `external` | `bindRecording` replaces the local archive. | Only `health: 'unknown'`. No local path or invented loss counters. |

Off suppresses new capture without changing its configured destination. Queued writes can finish. Archive failures remain `local-archive` with measured losses.

Local counters describe only this guard's writer. `written` counts completed stage-file writes, not durable or complete invocation coverage.

`bindRecording` takes precedence over `TENET_RECORDING=off`, which disables only the local archive. External health stays unknown even after successful sink calls or caught binder/sink errors. The SDK has no external health-reporting contract and does not drain or dispose external sinks. Successful `close()` says nothing about external durability.

Recording configuration and health never determine permission. A failed archive or sink cannot block a permitted call or release a blocked call. Dispatch only from fresh `beforeTool` permission.

## History, events and disposal

### Admit bounded untrusted history

`setHistory` accepts only host tool-call/tool-result observations, never owner findings. The SDK applies recent-event and byte bounds, sanitizes content and fields, and labels history untrusted. Hosts must not hide findings inside tool data. History cannot supply approval or authenticated external facts. Snapshot capture excludes subsequent result content from the current assessment.

Nonzero history inspects at most the last 4,096 own-descriptor array slots before whole-group count selection. An uninspected prefix counts as prior admission omissions with `history-admission-window`. Rejected/accessor/sparse slots also count as prior omissions without invoking getters.

Valid selector exclusions count as dropped events. Zero history reads no slots and counts the input length as selector drops.

Groups use nonempty session+call identity with exactly one observed call and subsequent matching observations. Earlier results and reused IDs stay singleton observations. Groups prefer their latest member and preserve retained ingestion order. Content tightens before whole-group byte eviction. Live incremental losses cannot be recovered by a later result.

`setHistory(history, capture?)` accepts readonly `HistoryCaptureMetadata` with exactly two interpreted fields:

- `priorOmittedEvents`, a nonnegative safe integer.
- `admissionLimited`, a boolean.

Both must be fixed own data descriptors. Missing/malformed fields or accessors throw `invalid-history-capture-metadata` before replacement history is inspected or installed. Combined counter overflow throws `history-count-overflow` before replacement.

Extra fields, getters and `toJSON` are not read. Host arrays and metadata are not frozen or traversed as arbitrary objects.

This optional metadata adds negative coverage reported by the host. Its count is known omitted source admission slots, not an exact count of missing tool calls, results or effects. A transcript entry can contain unknown nested blocks. `host-reported-capture-slots-not-tool-event-counts` identifies that provenance; `admissionLimited: true` adds `history-admission-window`.

The SDK still adds its own omissions and selection drops. Zero/false cannot lower counts, clear a limitation or guarantee complete capture. Lookalikes in event data stay literal. Capture metadata cannot supply identities, authenticated facts, approval, permission or execution evidence.

Pi uses `nativeHistory` before this boundary. It reads the same frozen-environment `readConfig` limits as the guard. Branch entries, nested assistant block slots and assessed-ID discovery share one 4,096-slot allowance.

Only inspected eligible records for the selected session establish assessed-call eligibility. Decision/approval/report content never becomes tool evidence.

Excluded entries add only known slot counts, not guessed nested blocks or eligible events. Zero history reads no source slots and keeps known branch-input-length selector-drop accounting. Owner UI report restoration is separate from evaluator-history admission. Historical payloads, counter meanings and contract identities stay unchanged.

### Keep owner events out of agent history

`onOwnerEvent` receives immutable permission, assessment, execution, activation and capture-health events. Rule diagnostics retain recorded score gates without provider-invented rationale. Keep events in owner-only UI or storage, never agent messages, tool results or later evaluator evidence.

Permission and assessment events carry an `OwnerReport` when a finding snapshot is available. It includes invocation identity, mode, snapshot rules, approval conditions, assessment status and validation issues. Pi uses it directly for live owner UI.

Live delivery does not depend on transcript persistence or historical parsing.

A prepared permission report can be superseded after revalidation; update the same invocation rather than counting a second call. Capture events include asynchronous archive losses.

`onOwnerRecord` optionally delivers immutable `status`, `assessment`, `decision`, `approval`, `permission`, `assessment-status` and `execution` records. Pi stores these as non-message custom transcript entries and validates recorded contracts when recovering findings. This is not an archive sink and delivers neither submitted requests nor raw provider responses.

Owner records retain rule text, validated scores and metadata. Keep them out of agent history and evaluator evidence. Committed release records arrive outside the final synchronous handoff; only the completed `beforeTool` result can authorize dispatch.

Event/sink failures cannot grant authorization or veto observation. Callbacks must be local and bounded. Synchronous JavaScript callbacks cannot be preempted.

### Revalidate and close

In enforce mode the SDK revalidates invocation-bound authorization after asynchronous handoff and owner delivery. If a callback closes or invalidates a session, cancels the invocation or changes its binding/policy, final permission is blocked. A permission event can be superseded while its callback runs. Events are not a dispatch channel.

The runtime commits a prepared release only after SDK checks. One finalizer records terminal permission and owns result tracking. A prepared release does not enter the archive or start result tracking.

Cancellation and close finalize pending work as blocked before recording ownership is removed. Committed release reporting runs outside the synchronous handoff; teardown flushes it before dropping the session. Off still suppresses new capture.

Context replacement, off, detected policy staleness and close cancel applicable background work. Closing one session leaves others alive. Closing the last eligible session stops control watches. Repeated close is safe.

`guard.setActivation(value: 'on' | 'off'): Promise<Activation>` writes cooperative owner control. `guard.close(): Promise<boolean>` revokes all sessions and closes the local archive with a bounded drain. The default is one second, configurable from zero to five seconds. A false close result means incomplete archive drain, not valid permission. `setActivation` after close throws `guard-closed`.

Disposal does not await a provider or trusted UI and cannot release caller-owned external resources that ignore cancellation. For isolated embedding/tests, pass a complete `env`, an injected `judge` or lazy `createJudge`, an absolute isolated `controlPath`, and `TENET_RECORDING: 'off'` or an isolated recording directory. Dispose caller-owned sinks yourself.

The SDK retains `applicability-v1`, current questions, thresholds, built-in integrity and capture defaults. Historical readers use each record's contract, not today's policy to reevaluate old findings.
