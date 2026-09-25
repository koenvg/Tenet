# Proposal

## Why

In a fixed September 25 sample, TENET would have blocked 133 of 157 calls: 92 despite every rule selecting PASS, and 32 of 36 FAIL-labelled calls for edits or staging rather than commits. Observe mode allowed every call but still added a median 875 ms of assessment time, while an outdated inspector hid the newest recordings.

## What Changes

- Add versioned, host-supplied action facts, including resolved edit targets, literal-content versus execution semantics, provenance and explicit missing facts. Never infer trusted capabilities from a tool name or its description.
- Add an opt-in applicability-aware assessment profile. A supported, complete action description can receive a high-confidence NOT_APPLICABLE result without a second evidence-confidence veto for that rule. Relevant uncertainty stays fail-closed in enforce mode; unknown tools and opaque execution receive no automatic exemption. Keep the existing profile as the default until separately authorized semantic evaluation supports promotion.
- Clarify the bundled Git-commit rule without granting approval exceptions or rewriting external owner policies. Add edit, staging, actual commit, merge, compound-operation and policy-integrity regression cases.
- **BREAKING:** Make observe-mode evaluation asynchronous from an immutable pre-execution snapshot. Permission is released before assessment completes; pending and dropped assessments are not represented as ALLOW or BLOCK. Enforcement remains synchronous.
- Separate suspected violations, confidence uncertainty, approval requirements, evaluator unavailability and pending/dropped observation in owner reports and inspector views. Group repeated uncertainty without hiding individual calls.
- Diagnose provider probability-precision incompatibilities and permit a precision adapter only for a verified provider contract, without silently changing decisions at thresholds.
- Version the new recording contract, retain historical interpretation and add reader/build compatibility reporting. Document rebuilding and restarting stale inspectors; do not change the running server as part of planning.
- Add a sanitized replay corpus with explicit expected labels, false-block and unsafe-allow denominators, and an explicit authorization gate for any live provider evaluation.

## Capabilities

### New Capabilities

- `resolved-action-evidence`: Bounded action facts from host adapters, target resolution, provenance, freshness and unsupported-host behavior.
- `background-observation`: Non-blocking observation assessment with snapshot isolation, bounded work, lifecycle cancellation and independent permission/execution records.
- `owner-finding-triage`: Distinct owner-facing finding categories, grouping, compatible historical inspection and reader-version visibility.

### Modified Capabilities

- `configurable-policy-enforcement`: Versioned applicability-aware classification, conservative relevance handling, provider validation diagnostics, policy clarification and reproducible friction evaluation.

## Impact

- Shared decision and runtime modules in `src/decision/` and `src/runtime/`, Pi and Claude adapters, recording contracts, and the inspector reader and Svelte client.
- Existing decision, Jev, trajectory, runtime-contract, observe-mode, recording, owner-reporting and browser tests; semantic replay fixtures and reports in `eval/`.
- Existing deployed host adapters do not expose authenticated anchor resolution. The change must expose this limitation and must not claim a working trusted shortcut until an executing-tool integration supplies and validates the required facts.
- Existing OpenSpec changes for observation and standalone inspection remain historical work. This change explicitly revises observation timing and assessment compatibility rather than silently editing those proposals.
- No blanket threshold reduction, approval reuse, automatic owner-policy migration, host restriction bypass, public inspector exposure, archive rewrite or live evaluation authorization. No implementation occurs during proposal creation.
