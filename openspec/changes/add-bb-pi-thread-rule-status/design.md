# Design

## Context

See proposal.md for motivation and `specs/bb-pi-thread-rule-status/spec.md` for the behavior. Pi's `registerGuard` already receives process environment and writes version-2, host-qualified immutable stage files under `~/.tenet/recordings` or `TENET_RECORDING_DIR`; `TENET_RECORDING=off` disables capture. `ArchiveIndex` provides bounded indexing and on-demand detail, and `invocationView` projects recorded assessments, decisions, permissions and execution separately. The current archive identity includes Pi session ID, but not BB thread ID. BB launches this Pi process with `BB_THREAD_ID` and exposes a thread's provider and host through its SDK. BB offers `threadPanelAction` and `experimental_threadHeaderAction` for thread UI, a host entry for machine-local work, and typed RPC for the owner-facing app. BB lifecycle events announce changes but cannot veto or prove individual tool effects.

## Goals / Non-Goals

**Goals:** Preserve one source of truth for assessment semantics; link new records to a BB thread without importing old records by guesswork; keep sensitive archive reads on the Pi thread's machine; make a finding visible without per-call interruptions.

**Non-Goals:** Guarding all BB providers, making TENET run when the Pi extension or policy is absent, deriving compliance from BB transcripts, retroactively linking legacy records, changing approval or enforcement, or making the archive an audit-grade execution log.

## Decisions

### 1. Stamp an optional BB association into Pi archive records

At `registerGuard`, accept a strictly bounded BB thread ID from the BB-provided process environment when present. Bind it to each newly written Pi record as optional version-2 envelope metadata, with validation on read. Do not alter the hash key of the Pi session archive directory, native Pi session identity, question payload or policy decision. Keep old version-1 and version-2 records valid. The owner lookup groups records by exact `(machine, bbThreadId)` and then Pi session and invocation; a resumed thread retains its linked past calls, and a fork gets its own BB thread ID. A single Pi session appearing under multiple BB threads is not merged into one thread's findings. BB thread IDs are routing hints, not authorization proofs: the BB backend first obtains provider and machine from the selected BB thread, never from an archive file or client-supplied host path.

Alternative: correlate on working directory, Pi session ID or timing. Those values can be shared by unrelated BB threads and cannot safely link older records.

### 2. Read the archive on its host through BB, not by opening a second inspector server

Scaffold a BB package-layout plugin in this repository with server, app and machine host entry. The BB backend resolves the requested thread through `bb.sdk.threads.get`, checks the Pi provider, selects its host, and invokes its own host entry. On the host, locate the standard TENET archive or an explicitly configured per-host absolute recording directory. Use the same validation, owner-permission and no-symlink rules as TENET's reader. Package the reusable reader/projection code with the BB plugin rather than importing Pi runtime state or copying the evaluator. Do not require TypeSafe credentials or run a Pi process to display history.

Extend the existing metadata-only index with a bounded per-invocation projection of validated selected FAIL identities and coverage health. A status lookup returns counts and availability, not raw request/response evidence; a paginated detail lookup reads only the selected linked invocations and returns rule text, source line, severity, selected outcome/confidence, tool/call identity, mode, would-decision, permission, and observed execution. Never return raw arguments, submitted state, provider prose or response snapshots to BB. Use bounded pages and cap scans; show `indexing` or `incomplete` while the archive cannot be fully indexed. A closed, disabled or unreachable host yields unavailable coverage, never a cached green result. Read-side failures cannot reach guard execution.

Alternative: scan BB's timeline or import the entire archive into BB server storage. The timeline lacks complete validated assessments; copying evidence expands access and storage risk. An HTTP inspector URL on loopback would not work reliably for remote BB hosts and needlessly exposes detailed evidence.

### 3. Derive status from the recorded assessment, not the decision

A finding requires a valid assessed rule with selected `FAIL`. Keep WARN and built-in integrity visible as distinct rule types. A selected FAIL below its recorded outcome-confidence threshold remains a flagged but uncertain finding. Aggregate by recorded rule identity and policy snapshot, with links to each invocation, rather than showing every occurrence as a different rule. `APPROVAL_REQUIRED`, `UNKNOWN`, insufficient evidence, low confidence without FAIL, counterfactual BLOCK, and archive/policy unavailability are separate statuses. Even if every available record passed, say `No rule failures recorded in available assessments`; neither a released call nor absent records prove the action happened safely. Recordings turned off and dormant sessions can be indistinguishable from missing records, so the plugin says coverage unknown unless it has explicit evidence of inactivity.

Alternative: use the current `ArchiveIndex.sessions().concerns` count. It includes ASK and BLOCK and does not imply a selected FAIL; using it would label approval or uncertainty as a rule breach.

### 4. Keep BB UI quiet and owner-only

Register a Pi-only thread panel action that always opens a read-only status view. Register a compact header indicator only when the host summary reports a finding; render no indicator on passes or unknown status. Refresh while the view is open and on BB thread event-sequence updates or a bounded polling interval; never create a per-call toast or mutate a thread message. The indicator carries a short count/accessible label, not rule text. The panel presents rule text as escaped text and separates recorded findings, approval requirements and coverage limitations. Make the backend RPC inputs strict and outputs bounded; refuse arbitrary paths, session selectors and client-chosen machine IDs. Dispose frontend subscriptions and in-flight reads on unmount/reload. The Pi extension does not receive these displays as messages or later evaluator evidence.

Alternative: a persistent sidebar badge on every thread. It makes the default noisy and hides whether no badge means no records or no failures.

## Risks / Trade-offs

- **Recording gaps or disabled capture** -> Always use qualified language; surface indexing, writer loss, unknown execution and missing stages. A displayed finding can be real evidence of the judge's classification, not proof of an external effect.
- **Cross-host archive access and custom locations** -> Run reads on the selected host, configure an absolute per-host archive location when it differs from the default, and verify host routing in BB. Never ask the browser to fetch a host-local path.
- **Archives contain sensitive evidence** -> Keep raw stage payloads host-local, return only minimum projected fields, escape policy text, and retain TENET's private-file checks. Same-user code can still read owner files; this is not a security boundary against the agent.
- **Package/build drift** -> Use current BB SDK declarations and `bb plugin new` for scaffolding, package reusable read-only modules explicitly, run `bb plugin types` and `bb plugin build`, and test that a managed/path install can resolve its declared dependencies.
- **Unbounded history** -> Reuse the existing incremental, metadata-only archive index, cap records parsed per refresh and details per page, and report incompleteness rather than scanning forever or declaring clear.

## Migration Plan

1. Add and test optional BB association on newly written Pi records and reader compatibility with historical envelopes; do not rewrite existing archives.
2. Build the Pi-only BB plugin and its host-side summary reader, then verify remote-host routing, private archive reads and quiet UI with synthetic records.
3. Document that TENET must already be active and recording for this view, how custom archive paths are set, what `no records` means, and how to install/reload the plugin. A user can remove/disable the BB plugin without stopping TENET or losing its archive; rolling back TENET does not rewrite existing recordings.
