# Alpha embedding SDK

Import `createGuard` and value types from `tenet`. This private alpha entry supports Node 22.12+ and Bun 1.3.14+. `SDK_VERSION` is `alpha-1`. Breaking API changes are allowed during alpha. Only this entry is supported; do not import `src/`, runtime classes, queues or recording readers.

The SDK uses the existing policy parser, evidence capture, assessment validator, deterministic consequences and authorization checks. It does not create a second policy engine. Pi still calls the same underlying runtime directly; moving its wiring onto session handles is tracked separately in TENET-14. Claude Code remains an unverified prototype.

## Disclosure before use

By default, opening an eligible session enables local capture, and assessed calls submit rule text, tool arguments, metadata and bounded recent host observations to TypeSafe. Capture can contain source and secrets despite field redaction. Default capture lives in `~/.tenet/recordings`; cooperative owner control lives in `~/.tenet/control.json`.

Set `TENET_RECORDING=off` before construction to disable local capture. This does not stop provider disclosure. Owner control `off` stops new assessment and capture but does not erase old archives. Mode is fixed at construction; `setActivation('on')` does not select enforcement.

Imports and guard construction create no files, watches or provider requests. An eligible initialized session starts control observation. The provider is constructed lazily only on an assessment request. Dormant sessions produce no evidence or owner events. The SDK does not install or register host hooks.

## Build and run offline

From a checkout:

```sh
bun install --frozen-lockfile
bun run sdk:build
node -e "import('tenet').then(m => console.log(m.SDK_VERSION))"
bun -e "import('tenet').then(m => console.log(m.SDK_VERSION))"
bun run sdk:example
bun test test/sdk-contract.test.ts test/sdk-consumer.test.ts
bun run typecheck
```

`dist/` contains compiled ESM and declarations. The build also typechecks and compiles [the complete scripted host](../examples/sdk.ts); run it with `node examples/dist/sdk.js` or `bun examples/dist/sdk.js`. It exercises ready, dormant, uninitialized and unavailable sessions, pending observe permission, late counterfactual BLOCK, matched execution, trusted approval and off. It uses temporary paths and no production credential. These assertions test mechanics, not evaluator accuracy.

For a local-package consumer, build Tenet first and install that directory as a dependency. Keep the complete `dist/` tree and package manifest together. Consumer imports require no Pi, Svelte, inspector assets or source transpilation. The TypeSafe production dependency is needed only for the normal live judge. A production-only install archive is a separate delivery task; this task does not publish a package or change owner installations.

## Session contract

```ts
import { createGuard, type CurrentInvocation } from 'tenet';

const guard = createGuard({
  host: 'my-host',
  capabilities: ['interception', 'result-correlation', 'lifecycle-invalidation'],
  onOwnerEvent: event => ownerLog(event),
});
const session = guard.openSession({ sessionId: nativeSessionId, contextId: nativeContextId }, absoluteCwd);
await session.ready;
const result = await session.beforeTool({
  callId: nativeCallId, toolName: originalToolName, input: originalArguments,
  signal: nativeCancellation,
  current: (): CurrentInvocation => rereadNativeInvocation(),
});
if (result.permission === 'released') {
  // Dispatch the same invocation and unchanged original arguments.
  const actualResult = await dispatchNativeInvocation();
  session.afterTool(actualResult);
}
session.endTurn();
await session.close();
await guard.close();
```

This sketch names application-owned functions; the linked scripted host is the executable guide. Never dispatch from `wouldDecision`, `status`, a cached result or the ASK label. Await a fresh `beforeTool` result for every invocation and every retry.

`host` is the only required construction option. `capabilities` is an optional readonly list of guarantees your application provides, not a set of switches that implements those guarantees. Omitting it is equivalent to an empty list. Unknown names, duplicate names and the old boolean-object form are rejected. The SDK copies the declarations at construction; later changes to the supplied list cannot upgrade coverage.

| Capability | Host guarantee |
| --- | --- |
| `interception` | Tools pass through `beforeTool` before execution, and the host respects its permission. |
| `result-correlation` | Each result identifies the exact invocation that produced it. |
| `lifecycle-invalidation` | The host forwards cancellation and material session/context changes. |
| `argument-stability` | Checked arguments remain unchanged through executor dispatch. |
| `trusted-approval` | A trusted owner UI can confirm this invocation. A per-call `approve` callback is still required. |

You can supply `hostVersion`, `hostProfile` and additional `limitations` when useful. `session.status().capabilities` remains the full coverage report with explicit supported/unsupported booleans and action-resolution status. Recording retains that same report so historical records do not need a schema change. Undeclared interception does not turn assessment off; it means the SDK cannot claim that the host intercepts every applicable call.

`openSession` returns a handle immediately. `ready` resolves initialization; before it resolves, enforce withholds permission and observe releases with an unavailable assessment. Each host session selects its own policy from its absolute cwd. A confirmed absent local `TENET.md` without `TENET_POLICY` is dormant. An explicit missing policy, malformed policy, invalid configuration or missing judge credential is unavailable. No session borrows another's policy.

Status separates `state`, activation and configured mode. Dormant and off releases contain a `bypassReason` and `assessment.status: 'not-requested'`, never an ALLOW assessment. Unavailable observe releases have no would-decision. Enforce waits for current assessment and any required consent. WARN diagnostics remain advisory. Before-tool results are immutable snapshots with `execution: 'unknown'`; later events do not revise them.

Observe releases after bounded snapshot capture without awaiting the judge. Background work retains the current defaults: two running, 32 waiting, 1 MiB total snapshots and five-second queue age. Terminal owner assessment events distinguish completed, unavailable, dropped and cancelled work. Pending, dropped and unavailable work has no passing assessment. Guard status exposes aggregate queue and capture health; neither guarantees complete interception or durable recording.

## Host obligations and approval

- Declare only verified host capabilities. Omitted capabilities stay unsupported, even when callbacks are supplied. Optional `hostVersion` and `hostProfile` describe verified host metadata; omission reports `null`. Choosing enforce does not authenticate facts or upgrade coverage. Without a configured executing-tool-bound `actionResolver`, resolution stays unsupported. See [action resolution](action-resolution.md).
- Supply stable session/context/call identities. One handle owns one host session and context; close it before replacing that context. Call IDs must be unique for that session's lifetime, including retries. Forward original arguments, not field-redacted evaluator evidence. `current()` must reread live host identity and arguments before release.
- Forward cancellation and material context/session changes. `invalidate(reason)` revokes pending authorization and background observations for that context. Session close prevents further calls on that handle. New calls require new before-tool authorization; authorization is not a reusable token.
- If trusted approval exists, include `'trusted-approval'` in `capabilities` and supply an invocation-local `approve(request)` callback. Call `await request.valid()` immediately before displaying trusted UI. Bind the displayed policy, tool, argument digest and rule IDs to that request. Respect its abort signal and deadline. Return `approved` only for explicit positive owner consent. Denial, dismissal, missing UI, timeout and UI errors must not approve. Agent messages, history and host permission settings are not consent.
- The SDK bounds approval wait even when a UI ignores abort. Late confirmation cannot release cancelled, closed, stale or changed work. Hosts still own UI disposal and dialog serialization; do not overlap an unacknowledged cancelled dialog with a later one.
- Dispatch only according to actual permission. Preserve assessed arguments through dispatch, or declare argument stability unsupported. Checks before hook release cannot freeze a host executor afterwards. Released permission is not proof of execution and is not a filesystem sandbox.
- Forward only observed results with their original identities. `afterTool` returns unknown for missing/unmatched results or when `'result-correlation'` is omitted. It never infers success from release. Capability declarations are host obligations, not a certification by the SDK.

## History, events and disposal

`setHistory` accepts only host tool-call/tool-result observations. The SDK retains configured recent-event and byte bounds, sanitizes content and fields, and labels history untrusted. Excluded older entries and rejected entries count toward `omitted` and the `history-omitted` limitation, without inspecting the excluded prefix. It does not accept owner findings as a history event kind. Hosts must not hide findings inside tool data. History cannot supply approval or authenticated external facts. Snapshot capture excludes subsequent result content from the current assessment.

`onOwnerEvent` receives curated immutable permission, assessment, execution and activation events. Rule diagnostics retain the recorded score gates without provider-invented rationale. Keep these events in owner-only UI or storage. Do not append them to agent messages, tool results or later evaluator evidence. Event/sink failures cannot grant authorization or veto observation. Callbacks must be local and bounded; synchronous JavaScript callbacks cannot be preempted.

In enforce mode the SDK revalidates the runtime's invocation-bound authorization after asynchronous handoff and after owner delivery. If a callback closes or invalidates a session, cancels the invocation or changes its binding/policy, the final returned permission is blocked. A permission event can be superseded while its callback runs; events are not a dispatch channel. Only the completed `beforeTool` result authorizes the host.

In enforce mode, the runtime commits a prepared release only after the SDK's checks. One finalizer records terminal permission and owns result tracking. A prepared release does not enter the archive or start result tracking. Cancellation and close finalize pending work as blocked before recording ownership is removed. Committed SDK release reporting runs outside the synchronous handoff, and teardown flushes it before dropping the session. Off still suppresses new capture.

`endTurn` marks unmatched releases unknown. Valid background observations survive turn end; enforcement pending work is invalidated. Context replacement, off, detected policy staleness and close cancel applicable background work. Closing one session leaves unrelated sessions alive; closing the last eligible session stops control watches. Repeated close is safe. Guard close revokes all sessions and closes its archive with a bounded drain, default one second, configurable from zero to five seconds. A false close result means the archive drain was incomplete, not that permission remains valid. SDK disposal does not await a provider or trusted UI, and cannot release caller-owned external resources that ignore cancellation.

For hermetic embedding/tests, pass a complete `env` object, an injected `judge` or lazy `createJudge`, an isolated absolute `controlPath`, and `TENET_RECORDING: 'off'` or an isolated recording directory. `bindRecording` replaces the local archive with a caller-owned best-effort sink. The caller must dispose that sink's resources; the SDK owns no sink drain. No production credential or changes to the owner's home are required.

The extraction retains `applicability-v1`, the current question version, thresholds, built-in integrity and capture defaults. Historical readers continue using each record's contract rather than reevaluating old findings under today's policy.
