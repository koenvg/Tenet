# Proposal

## Why

The linked inspector session exposed nine calls that all ran in observe mode, yet every call appeared as a red "Would block"; none had a selected FAIL outcome. Routine calls also received uncertainty findings while action resolution was unsupported, and four code-execution calls lost their tool metadata from submitted evidence, so both presentation and assessment inputs need attention.

## What Changes

- Make recorded execution and actual TENET permission primary in call lists and summaries. Keep mode, findings and counterfactual enforcement decisions separate; released permission alone must never imply execution.
- Present observe-mode uncertainty as amber assessment uncertainty rather than a red actual-block status. Preserve visible suspected violations, real TENET blocks, tool failures, approval conditions and unavailable or incomplete assessments.
- Prefer current-action descriptions over older history within the existing evidence budget, using a deterministic fallback when optional metadata itself cannot fit. Preserve current arguments, resolved facts, omission reporting and immutable snapshots.
- Clarify generic evaluator instructions so unsupported resolution alone does not demand UNKNOWN. Ordinary evidence can support PASS when the complete rule is determinable; the NOT_APPLICABLE exemption still requires complete authenticated facts.
- Version changed questions, preserve historical interpretations, and add sanitized offline regressions for benign operations and protected controls. Offline results must not claim improved live semantic accuracy.
- Keep confidence thresholds, whole-response validation, policy-integrity enforcement and invocation-local approval unchanged. No tool-name exemptions, external executor changes, archive rewrites, policy edits, live evaluation or running-service changes are included.

## Capabilities

### New Capabilities

- `inspector-call-status`: Consistent execution-first call presentation with separate actual permission, findings, mode and counterfactual decisions across historical and current records.
- `assessment-evidence-budgeting`: Deterministic retention of current-action context ahead of older optional history, with bounded fallback and explicit omissions.

### Modified Capabilities

- `configurable-policy-enforcement`: Clarify ordinary evidence versus authenticated applicability, retain conservative gates, and version changed evaluator instructions without reinterpreting historical assessments.

## Impact

- Inspector presentation helpers, call-list badges, decision summary, rule/check styling, and existing component and full-app browser tests.
- `src/decision/history-selection.ts`, `questions.ts`, assessment question identity, evidence-budget tests, applicability-contract tests, sanitized replay fixtures and report-only comparison identities.
- README and assessment/action-resolution documentation for the new presentation and evidence-retention order.
- This follows the implemented portions of `reduce-developer-friction`. Its older design and action-resolution documentation describe metadata-first eviction; this proposal explicitly changes that order rather than silently revising those records. Stock Pi and Claude resolution remains unsupported unless a real executor integration supplies facts.
- No new runtime configuration, public API, recording schema or dependency is planned. Implementation requires a separate apply request.
