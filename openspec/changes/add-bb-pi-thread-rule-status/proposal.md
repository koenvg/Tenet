# Proposal

## Why

TENET can record rule assessments for Pi sessions, but a BB owner cannot tell from the thread whether any rule was flagged. The separate decision inspector requires a second navigation step and does not link records to BB thread identity.

## What Changes

- Add a read-only BB plugin for Pi threads. Keep it quiet by default: no per-call notifications or agent messages; show a compact thread indicator only when a recorded rule assessment selects FAIL.
- Add a persistent, unobtrusive thread action to inspect rule findings and coverage even when no indicator is present. Identify the affected rules and assessed calls, including WARN findings and the built-in integrity rule. Keep approval requirements and unavailable or uncertain assessments distinct from rule failures.
- Associate newly recorded Pi assessments with their BB thread and machine when BB supplies a thread identity. Preserve older archives without guessing a link from working directories, titles, or timestamps.
- Read existing TENET records on the Pi thread's host; do not enable TENET, start assessments, change policy, approve calls, or modify enforcement. A thread without linked recordings reports unknown coverage, not compliance.

## Capabilities

### New Capabilities

- `bb-pi-thread-rule-status`: Read-only, quiet per-thread rule findings and honest coverage reporting for BB Pi threads.

### Modified Capabilities

None. Existing Pi policy activation and inspector launch behavior remain unchanged.

## Impact

The new BB plugin package needs frontend and host-side archive reading. TENET's Pi recording envelope and reader need a backward-compatible optional BB thread association. Existing policy decisions, archive records, inspector routes, and Pi-only installations remain usable. Verification must cover BB plugin SDK contracts, archive compatibility, multiple hosts and sessions, incomplete capture, and owner-only rendering.
