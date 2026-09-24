# Design

## Context

See proposal.md for motivation. `src/decision/decide.ts` already accepts `Judge` and has no Pi import. `src/pi/guard.ts` still owns policy eligibility, pending calls, lifecycle cancellation, trajectory, archive writing and Pi event registration together. `ApprovalQueue`, `Consequences`, `ActivationStore` and `GuardBoundary` provide useful existing behavior, but their ownership must be separated rather than wrapping the whole Pi extension.

Recording schema 1 identifies sessions without a host. `src/recording/contract.ts` also validates Jev-shaped request payloads. The first issue must change for multiple hosts; the second can remain because this change does not add judges. Tests in `guard-harness.ts`, `approval-lifecycle.test.ts`, `observe*.test.ts`, `global-control.test.ts` and `pi-smoke.test.ts` establish existing behavior to preserve.

Claude Code's official hooks reference, consulted during planning at https://code.claude.com/docs/en/hooks, documents synchronous command hooks, `PreToolUse` denial, tool result events, lifecycle events, and subagent identity. It also documents parallel matching hooks, input mutation through `updatedInput`, and non-blocking handling of several hook errors. `PermissionRequest` lacks `tool_use_id`; it is not proof of consent for a particular assessed invocation. Documentation describes a moving product, not verified behavior of an installed version.

## Goals / Non-Goals

**Goals:** Keep one owner of enforcement state; make adapters translate host events without reimplementing policy semantics; preserve Pi compatibility; support headless callers without UI dependencies; report conditional coverage honestly.

**Non-Goals:** A universal agent API, arbitrary plugin loading, an OS sandbox, remote service authentication, a new evaluator, or identical approval UX across hosts. First bridge support targets local macOS/Linux CLI installations. Windows, Claude web/Desktop-specific deployment and other hosts need separate verification before support claims.

## Decisions

### 1. Extract a deep runtime module, not a copy of Pi's extension interface

Create a host-neutral runtime module owning policy snapshots, eligibility, activation checks, invocation snapshots, bounded observations, assessment, consequences, approval validity, pending cancellation and recording emission. Its small interface opens a session, evaluates an invocation, accepts an observed result and invalidates/closes a session. Sessions carry host, host session, execution-context identity, cwd and lifecycle generation. Inject judge, trusted approval capability, activation/control storage and diagnostic sinks.

Pi retains native event registration, transcript decoding, commands, UI and inspector launch. Shared modules cannot import Pi types. Existing pure decision code remains reusable. Keep the evaluator seam separate and do not generalize probability semantics in this change.

Alternative: a broad `HostProvider` mirroring every Pi operation would make future integrations implement Pi concepts. Copying guard logic into Claude hooks would make fixes diverge.

### 2. Capabilities describe verified guarantees, not requested settings

Report pre-execution interception, result correlation, lifecycle coverage, assessed-argument stability and trusted approval availability with version/configuration limitations. An enforce setting does not by itself certify coverage. Reject unsupported protocol versions and identify unknown host versions/configurations as unverified. Known unsafe composition, such as input-mutating hooks after assessment, is outside the enforce support profile and must be reported explicitly.

No automatic fallback from enforce to an apparent pass. Handled runtime failures become unavailable and deny in enforce; observe remains non-vetoing. The process cannot guarantee denial if Claude never starts or forcibly kills the hook. Record that as a host limitation, not as a solved error path.

### 3. Use command hooks plus a private local bridge

A short-lived CLI reads bounded JSON from stdin, validates it, maps the event, calls a versioned local bridge and writes only Claude's protocol response to stdout. Use a Unix-domain socket in an owner-only directory, reject unsafe/symlink paths, and enforce payload and response limits. No network listener or inspector write endpoint. The bridge hosts the same runtime Pi embeds and holds concurrent session state. The owner starts it explicitly; do not spawn a daemon from an agent tool call or silently install hooks.

Use synchronous, catch-all `PreToolUse` hooks with no tool-family filter. Register successful/failed result and relevant session/turn/subagent lifecycle hooks. Hook inputs lacking descriptions or schemas get explicit missing-metadata markers, not invented tool definitions. Do not read arbitrary `transcript_path` files to fill gaps.

The client has a deadline shorter than Claude's configured hook timeout, allowing it to emit a valid denial on bridge failure. Read mode/activation from trusted launch configuration and the shared control store, never from tool arguments. A bounded local eligibility preflight retains dormant/off bypass when the bridge is absent; a previously eligible session must not become dormant because its policy disappeared. Persist only minimal eligibility/generation metadata needed for that distinction in owner-only runtime state, separate from recordings. Ambiguous or lost state is unavailable, not newly dormant. On bridge restart require a fresh generation; never reuse pending releases or approval state.

Alternative: direct HTTP hooks would add a listener and documented fail-open connection handling. Stateless per-event evaluation would lose stale-policy latches, duplicate-call protection and reliable concurrent history. The bridge is not a remotely accessible multi-tenant server.

### 4. Leave host permission checks intact and deny unsupported ASK

For enforce BLOCK, unavailable or ASK without trusted approval, emit `PreToolUse` `permissionDecision: deny` with a bounded safe reason. For ALLOW, return no permission override so Claude still applies its permissions. Never emit `allow`, `updatedInput`, `additionalContext` or synthesized approval in this adapter. Observe emits no decision or finding to agent context; the archive/inspector is the owner reporting channel.

Pi keeps its existing invocation-bound native approval queue. Claude Code advertises trusted approval as unavailable in this release. Native `ask` is not used because the integration has not established exact consent correlation and final argument revalidation. Unattended applications use the same no-approval behavior by default.

### 5. Qualify identity and keep state generation-bound

Use host + native session + execution context + native call ID for correlation, plus a Tenet invocation ID. Keep parent/subagent contexts distinct. Reused or conflicting call IDs invalidate ambiguity rather than granting permission. A replayed request cannot create a reusable permission token. Reconnects, resume, compaction, clear, end and child lifecycle events must have explicit mappings proven against the supported Claude version; missing events yield incomplete coverage and unknown execution.

Snapshots exclude later sibling results. Lifecycle invalidation cancels pending requests. Host dispatch remains outside the runtime; a released call is never proof of execution. Resumption uses only bounded Tenet-associated observations, never arbitrary transcript content or observation findings. Missing bridge history is disclosed and never reconstructed as certainty. Minimal control state is not a diagnostic archive and must not retain action payloads when capture is disabled.

### 6. Version new archives while keeping old Pi data readable

Introduce a versioned recording envelope with host and execution-context identity. Read existing schema-1 archives as legacy Pi records; preserve their paths and links. New indexes and hashed identifiers include host/context so identical native IDs cannot merge. Inspector views show host, adapter capability limitations and unknown outcomes without adding control actions. Retain existing exact evidence, redaction, size limits, owner permissions and capture opt-out. Keep Jev payload presentation unchanged.

Alternative: adding a host label only in the UI leaves storage and session-index collisions unresolved.

### 7. Reuse cooperative activation, without assuming it suits future services

Pi and the local Claude bridge use the existing owner/machine control store. Provide an owner CLI for status/on/off; keep Pi commands intact. Runtime callers inject activation scope, so a future server deployment is not forced to use a laptop home directory. No remote deployment is implemented now. Off skips new assessment and capture; pending enforce work is cancelled rather than released by late responses. Bridge health and capability status remain distinguishable from effective mode and activation.

## Risks / Trade-offs

- Hook process not started, killed or timed out: document bypass limits, test host behavior, and never describe this as fail-closed infrastructure.
- Parallel hooks can mutate input: support only a tested non-mutating composition; test conflicting hooks and expose the unsupported configuration. No claim that hook order freezes arguments.
- Claude CLI changes: pin the verified version/profile in fixtures and docs; mark other versions unverified until tested.
- Missing or duplicate lifecycle events: invalidate generations conservatively, bound idle state, and mark unresolved calls unknown.
- Same-user tampering: private sockets/files restrict accidental exposure but do not protect against agents with the owner's filesystem access.
- New bridge increases operational cost: preserve direct embedding for Pi and require explicit bridge health/status checks.
- Extraction regresses mature Pi behavior: land contract tests before moving ownership, retain pinned Pi smoke and archive compatibility gates.
- Active inspector work overlaps recording changes: build on the checkout's schema and preserve old records, URLs and pending workflow tests.

## Migration Plan

1. Establish offline runtime contracts and extract behavior while Pi remains the only active adapter.
2. Add versioned record readers before enabling new writers; keep old archives untouched.
3. Add the bridge and Claude hook client with process fixtures and explicit setup documentation.
4. Verify a pinned Claude CLI with harmless local actions and scripted judge results in isolated settings. Do not modify the owner's settings or use real publishing actions. If that environment is unavailable, report host verification blocked and do not claim completed enforcement support.
5. Opt in by starting the bridge and installing the documented hook entries, initially in observe mode. Owner explicitly selects enforce after checking coverage.
6. Roll back by removing Claude hook entries and stopping its bridge, then restoring the prior Pi package if needed. Keep recordings; the older inspector may not read the new format, so retain the newer reader for historical access. Removal ends Claude protection and must not be described as continuing enforcement.
