## Why

Owners currently must change the evidence-confidence threshold for every rule to adjust just one. Allow each rule to declare its own threshold while preserving the global fallback and independent enforcement gates.

## What Changes

- Support optional `evidenceThreshold=<number>;` metadata after an explicit BLOCK or WARN prefix, for any rule without domain-specific logic.
- Resolve each rule's evidence threshold from its override or `TENET_EVIDENCE_THRESHOLD`, which continues to default to 0.90. Built-in integrity continues to use the global threshold.
- Keep outcome thresholds, evidence labels, approval requirements, enforcement modes and generic judge questions unchanged.
- Validate overrides and reject malformed declarations instead of silently ignoring intended metadata.
- Report the effective threshold consistently in diagnostics, recordings, inspector views and replay output, including passing rules.
- Configure the bundled email rule at 0.80; leave other bundled rules inheriting the 0.90 default.
- Reserve the metadata slot immediately after explicit severity. Existing text in that slot beginning with `evidenceThreshold` may require rephrasing; semicolons in ordinary rule text remain supported.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `configurable-policy-enforcement`: Generic per-rule evidence thresholds, strict parsing, effective-threshold reporting and preservation of existing gates and defaults.

## Impact

- Decision contracts and policy parsing in `src/decision/contracts.ts` and `src/decision/policy.ts`.
- Threshold resolution and diagnostics in `src/decision/diagnostics.ts`, decision validation, and recording contributions in `src/recording/rules.ts`.
- Inspector projections and offline replay paths that currently assume a global evidence threshold.
- Parser, decision, recording, inspector and replay tests; README policy/configuration guidance; bundled `TENET.md` during implementation only.
- No new dependency, provider request, domain-specific evaluator prompt or per-rule outcome-threshold setting.
- Existing main requirements retain 0.90 defaults and generic evaluator behavior. This delta extends their effective-threshold semantics; older pending parser specs describing all post-severity semicolons as prose must be reconciled when archived.
