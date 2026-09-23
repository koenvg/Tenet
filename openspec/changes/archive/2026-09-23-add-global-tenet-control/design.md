## Context

See `proposal.md` for the owner need and `specs/global-tenet-control/spec.md` for the behavior contract. Today `registerGuard` snapshots `TENET_MODE` and recording config at extension load; `session_start` loads policy and emits status, `tool_call` binds an archive sink before evaluation, and `tool_result` feeds later evidence. `/tenet` is the only registered command. `GuardBoundary`, `Consequences`, `ApprovalQueue`, and the pending-call map make enforcement and cancellation observable. The Pi package can be loaded globally from a local path, but the default policy path is the session cwd's `TENET.md`, not a global policy.

The unarchived observe-mode change says the **observe/enforce mode** is fixed for the process. This design keeps that true: a separate shared activation bit overrides whether TENET runs at all. The recording change still controls capture while on.

## Goals / Non-Goals

**Goals:** A single owner-local on/off state, live propagation among Pi processes, an off path that creates no fresh evidence, and safe cancellation when a transition crosses an active assessment.

**Non-Goals:** Revoking already dispatched tools, resisting a same-user agent that can edit files, changing semantic decisions or policy rules, controlling non-Pi agents, starting the inspector, or installing TENET on the owner's machine during planning.

## Decisions

### Keep activation separate from mode and recording

Retain `TENET_MODE` as the process's base `observe` or `enforce` mode. A machine-wide activation value overrides it. Off is a true bypass of TENET evaluation and capture, not `observe`, `TENET_RECORDING=off`, or an unregistered extension. On re-enters the existing mode and reloads readiness as needed. This avoids silently upgrading observation to enforcement or making an off command erase historical evidence. Alternative: mutate `TENET_MODE` or unload the extension via Pi configuration. Neither offers an immediate, distinguishable off state while keeping `/tenet on` available in all sessions.

### Use one owner-local atomic control file

Use a small versioned file at `~/.tenet/control.json` containing only the activation choice, with the existing `~/.tenet` owner-restricted directory conventions. Reject symlinked/unsafe paths and oversized or malformed content. Write a unique same-directory temp file with owner-only permissions, flush it, rename atomically, then report command success. Concurrent commands are last successful rename wins; status rereads the effective value rather than trusting the initiating process's stale cache. Missing file means on for backward compatibility; after a configured file goes missing, an active process treats the loss as unavailable, while a fresh process cannot distinguish deliberate removal from first use. Document that deleting the file resets fresh processes to on. An unreadable or invalid file is CONTROL UNAVAILABLE, never an implicit off/on. In that state make no evaluator or archive submissions, preserve fail-closed enforce and non-vetoing observe behavior, and allow a valid owner command to repair the file. Alternative: Pi settings or process environment. They do not synchronize already-running instances and risk modifying unrelated Pi settings.

### Combine notifications with boundary reads

Each loaded Pi process watches the control directory for changes and uses a short unref'd periodic refresh while a session is active, so idle footers and in-flight requests update even when filesystem watch events are missed. Reattach on `session_start`, close on `session_shutdown`. At the entry of every `tool_call`, reread the file before binding an archive sink or capturing arguments. Recheck the shared state after asynchronous evaluation and approval and immediately before returning permission; never rely solely on cached notifications. The new activation generation joins the guard's existing lifecycle checks. An observed off or unavailable transition aborts pending judge/approval work and invalidates approvals; once off is observed, do not append new evidence or synthetic success stages for those calls. They may appear incomplete in the existing inspector, which is preferable to falsely claiming execution. Writes already queued in the archive may drain. An enforce-mode pending call returns a veto; an observe-mode pending call returns no veto. Previously released work cannot be recalled.

Guarded calls cancelled by an off transition keep a call-ID tombstone, so results delivered after on remain excluded. When restoring a Pi transcript at on, session start or tree change, recover native tool calls and results only for call IDs with a matching TENET permission record in the same session. Off-state calls have no such record. Uncorrelated native history is omitted with a visible trajectory limitation; existing bounded, guarded historical observations remain available. This avoids persisting off-time evidence or control markers in the Pi transcript.

An off command persists the choice and locally cancels pending work before returning; it does not wait for other processes. Their watchers/pollers may notice off after the command reports success, so a remote pending assessment or approval can complete first. A process can also change the shared file between the last read and Pi dispatch. Neither race is a promise of atomic cross-process permission. The watch/poll path aims for subsecond idle propagation; tests should exercise a bounded wait and synchronous reads at both tool boundaries. Alternative: watch alone can miss rename events; poll alone gives poorer prompt cancellation and status latency. A daemon, peer acknowledgment registry, or cross-process lock around every executor is out of scope.

### Preserve user-only command and reporting behavior

Route `/tenet` arguments through the existing command, keeping no-argument findings. Show the effective state and base mode in footer and `/tenet status`, including unavailable control and current readiness. Do not add an agent-callable toggle tool or put control details in agent-visible messages. While off, avoid session status/archive writes and trajectory updates; do not clear historical recordings or findings. Keep the separate recording footer honest about active capture, rather than showing ON merely because the configured writer exists. Global loading instructions will use a stable local package path with Pi's user-level package registration and an absolute `TENET_POLICY` where no project policy exists. Explicitly note that Pi commands and this local file are cooperative same-user controls, not protected owner authentication.

## Risks / Trade-offs

- [Cross-process race] `/tenet off` may return before another process observes off; that process might assess or release an invocation first. Already-dispatched calls cannot be revoked, and a call can also race the final read and host dispatch. Mitigate with entry and release reads, watch/poll cancellation, and explicit documentation; never claim a machine-wide cancellation acknowledgment.
- [File integrity and same-user access] Another same-user process can change or delete the choice. Enforce fails closed on detected invalid state; document fresh-process deletion behavior and do not sell this as tamper protection.
- [Partial archives] Cancelled requests and buffered writes can leave incomplete or later-flushed historical records. Label these through existing incomplete-history semantics; do not fabricate a clean decision or delete old evidence.
- [Global policy readiness] A global Pi install does not supply `TENET.md` to every project. Document explicit absolute `TENET_POLICY`; turning on without a usable policy retains the existing unavailable behavior.
- [Additional I/O] Boundary reads and an idle refresh add filesystem work. Keep the file tiny and watch/poll lifetime scoped to the active extension session, with tests covering burst calls and teardown.

## Migration Plan

Ship with missing control file meaning on, so existing installs keep their current mode and recording defaults. Update the README with global install, safe initial status checks, off/on, and rollback instructions. Turning off does not remove the Pi package or old `~/.tenet/recordings`; removing the global Pi package or extension path restores the prior no-extension behavior after a process restart. For rollback to a TENET version that lacks this switch, remove global loading or explicitly use that version's environment controls before starting Pi; an older version ignores `control.json` and cannot honor an off choice.
