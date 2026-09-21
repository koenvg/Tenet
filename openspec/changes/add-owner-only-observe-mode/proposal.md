## Why

TENET currently stops ordinary work when a rule selects PASS but its confidence falls below a threshold. Owners need to observe useful findings and false alarms without changing agent behavior before deciding whether to enforce their policies.

## What Changes

- **BREAKING**: Default TENET to observation mode. TENET never vetoes execution or requests approval in this mode, including when evaluation, configuration, policy integrity or reporting fails. Existing users must explicitly select enforcement to retain blocking.
- Add per-rule `BLOCK` and `WARN` settings. Preserve legacy `Rule; text` declarations as BLOCK rules; add explicit `Rule; BLOCK; text` and `Rule; WARN; text` declarations.
- Separate assessment findings, the counterfactual enforcement decision and actual permission. Keep current confidence thresholds and semantic evaluation.
- Show observation findings only to the owner through non-model UI and bounded diagnostic records, never agent messages or tool results. Distinguish suspected violations, uncertainty and unavailable evaluation.
- Provide an explicit owner-configured enforcement mode. BLOCK rules retain strict gates and invocation-bound approval; WARN rules remain advisory.
- Keep bounded evaluation before tool execution for this version. Observation removes vetoes, not evaluation latency or host restrictions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `configurable-policy-enforcement`: Add observation and enforcement modes, rule enforcement settings, owner-only reporting and mode-aware diagnostics; qualify existing unconditional blocking scenarios.

## Impact

Affected modules include `src/decision/policy.ts`, `contracts.ts`, `decide.ts`, `diagnostics.ts`, and `src/pi/config.ts`, `guard.ts`, plus trajectory recovery and reporting integration. Parser, decision, Pi lifecycle, approval, replay and smoke tests need mode-aware coverage. README and evaluation documentation must state the default change and limits. No new provider, tool allowlist, executor, sandbox or live evaluation is proposed.

The main spec currently requires blocking combined edit-and-commit calls and says diagnostics do not alter enforcement. This change explicitly makes those guarantees mode-aware. The older configurable-policy change and unfinished publication change describe fail-closed behavior; they are historical context, not permission to preserve observation-mode vetoes.
