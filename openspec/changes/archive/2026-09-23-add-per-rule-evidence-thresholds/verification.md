# Verification

Implemented generic optional evidenceThreshold metadata on explicit BLOCK/WARN declarations. The bundled email rule uses 0.8; other rules inherit the global evidence threshold, default 0.9. Outcome confidence and built-in integrity retain their existing global configuration.

## Evidence

- Test-first checkpoint: 1 passing and 5 failing parser/decision tests before implementation. Failures covered missing parsing, malformed metadata acceptance, global-only resolution, boundary/zero handling and invalid injected overrides.
- Bundled-policy checkpoint: the configuration regression failed before editing TENET.md, then passed after the email override was added.
- Final `bun test`: 241 passed, 0 failed across 29 files.
- Final `bun run smoke`: 3 passed, 0 failed through the pinned Pi integration.
- Final `bun run typecheck`: passed. The test UI selection stub now declares its actual string-or-undefined contract.
- `git diff --check`: passed.
- `openspec validate add-per-rule-evidence-thresholds --strict`: passed.

## Scenario coverage

- `test/rule-thresholds.test.ts`: generic BLOCK/WARN parsing, whitespace, numeric endpoints, legacy and literal-semicolon compatibility, malformed metadata rejection, mixed overrides, global fallback, integrity isolation, exact boundaries, zero, injected invalid values and bundled defaults.
- `test/rule-threshold-integration.test.ts`: independent labels and outcome gates, approval, both enforcement modes and severities, owner report thresholds, SDK metadata exclusion, passing/blocking archive contributions, historical inspector values, older/incomplete records, and offline replay contributions.
- Existing parser, response-validation, diagnostic, recording, inspector and replay regressions pass in the full suite. No evaluator question or question-version changes were made.

## Limits and archive note

Verification was offline with scripted judgments. No live provider requests or fixture actions ran, and these results do not establish semantic accuracy or calibrated safety. There was no visual UI change or manual browser test.

Only this change's planning artifacts were updated. Older pending configurable-policy and observe-mode parser specifications describe the previous post-severity text grammar. Reconcile that wording when archiving overlapping changes so it does not overwrite this metadata contract. Do not lower global defaults during reconciliation.
