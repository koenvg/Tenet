## Why

TENET currently recognizes one hard-coded publication sentence even though users expect `TENET.md` to define their rules. Allow users to write explicit plain-text rules and receive a separate assessment for every rule before a tool executes, without letting the agent weaken its own policy.

## What Changes

- Load one plain-text rule per `Rule; ...` line, preserving source location and binding rule identities to the policy snapshot.
- Replace publication-specific classification with structured per-rule PASS, APPROVAL_REQUIRED, FAIL, or UNKNOWN assessments and evidence sufficiency.
- Combine results deterministically: any failure or uncertainty blocks; otherwise any approval requirement pauses for native confirmation; only all-pass results allow execution.
- Interpret the complete rule, not a leading keyword: an unconditional prohibition cannot be overridden, while an explicit approval exception can require confirmation.
- Add a non-editable policy-integrity constraint: agent actions that would modify, remove, replace, or redirect the active policy file must not be released. Uncertain effects block. Owner edits outside the intercepted agent path remain possible.
- Preserve generic tool evidence, redaction, invocation-local approval, argument rechecks, separate audit stages, and fail-closed provider behavior.
- **BREAKING**: unprefixed legacy policy prose no longer activates a policy. Migrate the bundled publication rule to the explicit format and document manual migration for user-owned files. No silent conversion or rewriting of user policy.
- Keep evaluation action-local. Rules requiring unavailable history or external facts yield UNKNOWN rather than fabricated compliance.

## Capabilities

### New Capabilities

- `configurable-policy-enforcement`: Explicit rule-file parsing, per-rule semantic assessments, conservative aggregation, non-overridable policy integrity, and rule-aware Pi approval and audit records.

### Modified Capabilities

None in the main spec inventory, which is currently empty. The in-flight `add-semantic-publication-guard` change contains publication-only delta specs, not archived main capabilities. This change builds on its implemented slice and supersedes its single-policy decision contract; it does not claim completion of its deferred trajectory or lifecycle tasks. Reconcile those overlapping deltas before archiving either change into a shared main-spec baseline.

## Impact

- Decision contracts, policy loading, question generation, TypeSafe response validation, and aggregation in `src/decision/`.
- Policy-aware evidence, confirmation, status, and audit handling in `src/pi/`.
- Offline tests and pinned Pi smoke tests, bundled `TENET.md`, README and handoff documentation; existing saved publication evaluations remain historical evidence, not validation of new questions.
- Continue using the installed TypeSafe SDK, Jev, Bun, and native Pi execution hooks. No new executor, tool-name routing, OS sandbox, automatic policy authoring, or live provider calls during ordinary verification.
