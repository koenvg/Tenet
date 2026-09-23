## 1. Shared activation state

- [x] 1.1 Add a versioned owner-local activation store with atomic owner-only writes and bounded, validated reads; verify missing, on, off, malformed, unreadable, symlink, failed-write, and concurrent-write cases with isolated temporary directories.
- [x] 1.2 Add session-scoped change notifications plus a bounded refresh fallback; verify another running process sees both transitions while idle, the issuing process cancels pending work before off reports success without waiting for remote acknowledgment, and shutdown closes watchers/timers without keeping Pi alive.

## 2. Pi commands and presentation

- [x] 2.1 Extend the existing `/tenet` command with `status`, `on`, and `off`, preserving bare `/tenet`; verify idempotency, invalid arguments, failed persistence, repair of bad state, and owner-only output in command tests.
- [x] 2.2 Show OFF, ON OBSERVE, ON ENFORCE, and CONTROL UNAVAILABLE with base mode, readiness, and truthful capture state in owner status; verify the footer and command output never label off as observation or expose evidence to agent messages/results.

## 3. Guard transition behavior

- [x] 3.1 Gate `tool_call` before archive binding and evidence capture, and gate `tool_result` and session status paths while off; verify off makes no judge requests, approvals, invocation writes, or trajectory additions and does not veto newly entered calls.
- [x] 3.2 Integrate activation transitions with lifecycle cancellation and final shared-state reads; verify off during provider requests and native approvals cancels them, ignores late responses, vetoes unreleased enforce calls, permits unreleased observe calls, and cannot resurrect old approvals after on.
- [x] 3.3 Handle malformed or unreadable control state without a provider or archive request; verify enforce blocks, observe permits with owner-visible unavailability, and a successful on/off command repairs the state.
- [x] 3.4 Exercise two independent Pi guard instances across projects and process restarts using one temporary control path; verify persisted choice, prompt cross-process propagation, per-process mode restoration, and that an already released action is never reported as revoked.

## 4. Documentation and verification

- [x] 4.1 Document stable-path global Pi loading, absolute policy selection for other projects, command use, capture/privacy, rollback, same-user/dispatch races, and best-effort remote propagation without acknowledgment in `README.md`; verify each documented command and path against Pi package and extension behavior.
- [x] 4.2 Run the Bun test suite, Pi smoke suite, typecheck, and OpenSpec strict validation; verify no existing observe/enforce or recording behavior regresses while on, and record any live multi-process or host-contract verification not performed.
