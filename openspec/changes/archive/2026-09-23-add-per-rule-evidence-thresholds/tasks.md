## 1. Policy metadata

- [x] 1.1 Add parser tests for optional evidenceThreshold metadata on BLOCK and WARN rules across unrelated domains; verify failing tests cover whitespace, 0/1 boundaries, decimal syntax, legacy declarations and literal semicolons.
- [x] 1.2 Extend the readonly Rule contract and bounded policy parser to extract and validate the reserved metadata slot; verify parser tests pass for valid input and reject malformed, duplicate, nonfinite, out-of-range and empty-text declarations with policy-format while preserving digest identity and existing limits.

## 2. Deterministic threshold resolution

- [x] 2.1 Add decision tests before changing enforcement for mixed overrides, global fallback, integrity isolation, exact boundaries and zero; verify failures demonstrate the current global-only behavior.
- [x] 2.2 Introduce shared effective-threshold resolution and use it in diagnostics, with decision-boundary validation of injected overrides; verify decision tests pass and invalid overrides fail before invoking the judge.
- [x] 2.3 Verify FAIL, UNKNOWN, INSUFFICIENT, selected-outcome confidence, approval, WARN and observe/enforce semantics remain independent through scripted decision and Pi integration tests.
- [x] 2.4 Verify SDK request tests retain the same generic questions and semantic rule text without threshold metadata; keep question version unchanged and run the existing response-validation tests.

## 3. Reporting and replay

- [x] 3.1 Record resolved evidence thresholds in every assessed rule contribution using shared resolution; verify passing, blocking, WARN and integrity contributions agree with diagnostics and missing assessments do not fabricate contributions.
- [x] 3.2 Add inspector and owner-report coverage for effective thresholds; verify historical values survive policy changes, passing rules show overrides, and old or incomplete records retain their existing fallback/unavailable behavior.
- [x] 3.3 Extend offline replay fixtures and output to expose effective thresholds for passing and blocking rules; verify mixed generic overrides and inheritance without network requests or executing fixture actions, retaining existing replay regressions.

## 4. Bundled configuration and documentation

- [x] 4.1 Set the bundled email declaration to explicit BLOCK with evidenceThreshold=0.8 and leave publication/commit declarations unchanged; verify a bundled-policy regression test resolves email to 0.8 and all other rules plus integrity to 0.9 under default configuration.
- [x] 4.2 Update README policy syntax and configuration guidance with generic BLOCK/WARN examples, reserved-slot compatibility, numeric validation, global inheritance, unchanged outcome gates and rollback instructions; verify examples parse and describe no email-specific behavior or calibrated safety guarantee.

## 5. Integration verification

- [x] 5.1 Run bun test, bun run smoke, bun run typecheck and git diff --check after all edits; record results and any failures without claiming live semantic accuracy.
- [x] 5.2 Validate this OpenSpec change and compare delivered behavior against each delta scenario; verify no unrelated pending change artifacts were rewritten and document the pending parser-spec overlap for later archive reconciliation.
