## Why

A recorded TENET run blocked read-only shell inspection at PASS 0.88 and classified a README edit as violating a no-commit rule. Its terse block messages hid the distinction between a failed rule and a passing result below a confidence threshold, making safe tuning difficult.

## What Changes

- Clarify immediate-action semantics so a Git commit prohibition does not prohibit ordinary working-tree edits or inspection, while actual commits remain prohibited.
- Derive and expose every per-rule blocking gate with its relevant scores and thresholds, retaining existing aggregate reasons and fail-closed behavior.
- Extend the existing opt-in live replay with sanitized fixtures preserving the original rule wording, reported actions, and contrasting prohibited operations. Record question identity and per-rule gate diagnostics for comparisons.
- Keep both default thresholds at 0.90, the existing deadline, native approval requirements, and policy-integrity protection unchanged.
- Do not add raw session/request logging, tool allowlists, automatic retries, or a second evaluation runner.

## Capabilities

### New Capabilities

- `configurable-policy-enforcement`: Add explicit local-edit versus Git-commit semantics, exact blocking-gate diagnostics, and bounded regression replay requirements to the capability introduced by the pending `add-configurable-policy-rules` change.

### Modified Capabilities

None against main specs, which are currently empty. This change adds requirements under the existing pending capability path rather than duplicating its baseline requirements. Coordinate archive order with `add-configurable-policy-rules`.

## Impact

Affected implementation areas are `src/decision/questions.ts`, decision contracts and aggregation, Pi block rendering/session records, and existing evaluation fixtures and replay output. Tests cover decision gates, Pi integration, prompt payloads, and offline replay contracts; README/evaluation documentation explains diagnostics and live opt-in. No new dependencies or policy file changes are planned. The supplied `session.jsonl` is investigation evidence only and must not be committed or used as a test dependency.
