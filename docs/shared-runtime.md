# Embedded guard runtime

Use this reference to understand the private runtime behind Tenet's host adapters. It covers the developer checkout, not an import API. Embed Tenet through the supported [alpha SDK](sdk.md), rather than `GuardRuntime` in `src/runtime/guard.ts`.

`GuardRuntime` owns policy selection, readiness, assessment, consequences, cancellation, approval validity, bounded recent observations and result correlation. It imports neither Pi nor an interactive UI. Pi imports `tenet` and translates native events in `src/pi/guard.ts`; it does not construct the runtime, provider, activation store or archive.

Claude's separate offline command-hook prototype remains unverified. Installing Pi or choosing enforce does not establish Claude coverage. Stock Pi and Claude have no authenticated action resolver.

## Follow a host call

```text
Host events + original arguments + cancellation
  |
  v
SDK resources -> GuardRuntime -> assessment and permission
  |                   ^
  |                   | host trusted approval, if supported
  v
Host executor, only after fresh SDK permission
  |
  v
Observed result -> runtime correlation -> owner-only report
```

The host owns event translation, approval UI and execution. The SDK owns resource construction and disposal. The runtime checks the current invocation and policy. Findings, permission and observed execution are separate; none certifies complete host coverage or filesystem isolation.

For an executable offline check, use the [SDK example procedure](sdk.md#build-and-run-offline). It uses an injected judge and tests mechanics, not live evaluator accuracy or active host hooks.

## Inputs and results

### Construct and start

`RuntimeOptions` supplies environment settings, an injected `Judge`, an activation reader with `read`/`refresh`, and optional best-effort recording binder and event emitter. The runtime never constructs a provider or prompts the owner. Capture and owner reporting remain callbacks.

Optional `actionResolver` registration must be trusted and bound to the executor; see [authenticated action resolution](action-resolution.md).

Supply `Capabilities` at construction. The runtime copies and freezes them. `trustedApproval: false` prevents even a supplied callback from approving ASK. These declarations describe verified adapter behavior, not guarantees produced by selecting enforce.

`start({host, sessionId, contextId}, cwd, hasJudge)` selects policy relative to that cwd. It returns `Readiness` with `profile`, `questionVersion`, `eligible`, `policy`, optional `config` and `unavailable`, and `ruleCount`. The host must match the declared adapter.

Each host/session pair has independent policy, readiness and lifecycle generation. Starting another session does not cancel the first session's work. An unstarted session is unavailable; it cannot borrow another session's policy.

A confirmed missing local `TENET.md` without `TENET_POLICY` is dormant. An explicit missing source, unusable policy or bad configuration is unavailable. Mode is selected once at construction; observe is the default.

### Assess the current call

`call({host, sessionId, contextId, cwd, callId, toolName, input, metadata?, current, signal?, approve?, onPermission?, onPolicyStale?})` returns a veto `{block: true, reason}` or `undefined`.

`current()` must reread native identity and original arguments, not return a precomputed snapshot. `metadata` is optional and lazy. The emitted `decision` and `permission` stages keep assessment and actual permission separate.

ASK without trusted approval blocks with `approval-unavailable` and retains `wouldDecision: ASK`. Observe emits no veto or approval request. An SDK host must dispatch from the completed `beforeTool` result, not runtime events.

### Validate trusted consent

When trusted consent is available, `approve({policy, action, ruleIds, timeoutMs, signal, valid})` must obtain positive native consent for this invocation only.

The runtime checks policy, lifecycle generation, host/session/context/call identity, tool name and argument digest before displaying and after receiving consent. Call `valid()` immediately before showing the dialog. Pi's native queue does this and serializes dialogs. Agent text, host permission settings and transcript history are not consent.

### Report coverage and results

`coverageStatus()` reports frozen adapter capabilities beside activation, mode and session readiness. A successful assessment does not certify interception or execution.

`result({host, sessionId, contextId, callId, toolName, content?, details?, isError?})` records a matched observed outcome. Missing or ambiguous results remain unknown. Released permission is not proof that the executor ran.

Adapters recover only bounded Tenet-associated observations and pass them to `setObservations`. Recovered text never grants permission, supplies approval or authenticates external facts.

## Invalidate and stop

- `invalidate(reason, identity?)` revokes pending work and records unknown outcomes for unmatched releases. With an identity it invalidates only that context; without one it invalidates the runtime generation.
- `shutdown()` makes new calls unavailable until the next `start`.
- `activationChanged(value)` cancels pending work on off or unavailable.

Forward cancellation and material lifecycle changes. Late provider responses or consent must not release stale, changed or cancelled work. The SDK also revalidates after asynchronous handoff and owner delivery; see [SDK finalization and disposal](sdk.md#revalidate-and-close).

## Background observation

In observe mode, `call()` releases after bounded snapshot capture. Evaluator submission and completion run on a runtime-owned FIFO queue, not inside the host callback. Recording or capture failure cannot veto an observe call.

`RuntimeOptions.observationLimits` can override these defaults for tests:

| Limit | Default |
| --- | --- |
| Running | 2 |
| Waiting | 32 |
| Retained snapshots | 1 MiB |
| Queue age | 5000 ms |

The queue drops the newest work at capacity and expires old work before submission. Neither case produces a would-decision. `observationQueue.health()` reports running/waiting work, retained bytes, cumulative dropped/cancelled/completed/unavailable counts and configured limits.

`onPermission` runs once at release, with no would-decision while pending. Owner-only `onAssessment(identity, status, permission?, reason?)` runs independently. Completed reports carry the later counterfactual and do not revise permission. Pending, dropped or unavailable work is not a passing assessment.

### Preserve the captured snapshot

The snapshot freezes sanitized action, policy, decision config, profile, trajectory, evidence limits and session generation. Subsequent result content never enters that assessment.

Queue wait and provider duration are recorded separately in `assessment-status` stages, introduced with schema 3 and retained in current schema 4. The provider keeps its configured request deadline after dequeue. `result()` records execution independently, before or after assessment.

Missing results become unknown at `endTurn()`, invalidation or the bounded 60-second tracking window. `endTurn()` does not cancel valid observations. Invalidation, off/unavailable, session closure and shutdown abort them. Host turn cancellation before permission prevents assessment; after release it does not discard a valid session observation.

Shutdown does not await the judge. Archive drain is bounded. Queue and archive status do not guarantee complete interception or durable recording.

## Capability meanings

| Field | Verified adapter behavior |
| --- | --- |
| `host` | Adapter identifier. |
| `version`, `profile` | Actually verified host binary/configuration. `null` means unverified. |
| `interception` | Receives supported pre-execution events. |
| `resultCorrelation` | Result identity can join calls without ambiguity. |
| `lifecycleInvalidation` | Receives the lifecycle events it claims to handle. |
| `argumentStability` | Assessed arguments cannot change after the final check through execution. Hashing alone is not enough. |
| `trustedApproval` | Can obtain consent for this unchanged pending call. |

False or unverified fields belong in `limitations`. They do not change mode or turn ALLOW into proof of enforcement.

Pi's `/tenet status` shows version as unverified and lists limits separately from mode and readiness. Pi declares native approval, but not complete result identity or post-hook argument freezing. The headless fixture declares neither interception nor approval.

## Recording and host adapters

The SDK binds host-qualified archives, now schema 4, and owns their bounded drain. Pi translates native transcripts into `setHistory` tool observations, displays owner reports, serializes approval dialogs, registers commands and launches the inspector.

Owner records retain snapshot rules and contract versions for native recovery. Findings and consent never enter recovered evaluator history. New Pi result records remain unknown because result correlation is unsupported.

Historical schema-1, schema-2 and schema-3 records remain interpretable under their recorded contracts. Historical execution outcomes are not rewritten. Embeddings use the same SDK without Pi or an interactive UI.

## Independent decision entry

For checkout-only decision tests, `src/decision/decide.ts` imports no Pi code. Call `decide({ policy, action, cwd, judge, ... })` with a loaded policy set, captured action and trusted host working directory. Offline callers inject a scripted `Judge`; deadline tests can inject a `Clock`.

`createJevJudge` uses TypeSafe and makes live requests when called with credentials. It sends policy and action evidence and uses quota. Such a call needs separate authorization; use an injected judge for offline checks.

ALLOW and ASK are decisions for the caller to enforce, not execution commands. The Pi integration owns policy freshness checks and native confirmation. This private entry is not the public embedding API; use the SDK for applications.
