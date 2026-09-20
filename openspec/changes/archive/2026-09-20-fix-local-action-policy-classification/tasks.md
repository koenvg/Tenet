## 1. Preserve reported regressions

- [x] 1.1 Add sanitized fixtures to the existing evaluation fixture module for the exact reported inspection and README edit, preserving all original rule texts and synthetic host paths; verify fixture tests run without reading session.jsonl and contain no personal session identifiers.
- [x] 1.2 Add offline scripted-score regressions for shell PASS 0.88 / SUFFICIENT 0.93 and edit FAIL 0.58 / SUFFICIENT 0.90 plus integrity PASS 0.88 / SUFFICIENT 0.87; verify the existing BLOCK decisions and aggregate reasons are reproduced before changing diagnostics.

## 2. Derive exact blocking diagnostics

- [x] 2.1 Add tests for all five gate identifiers, simultaneous gates, exactly-at-threshold scores, non-default thresholds, missing assessments and FAIL at low confidence; verify new diagnostic assertions fail before implementation.
- [x] 2.2 Add typed diagnostics and shared gate derivation in the decision layer, preserving aggregate reasons and using the same gates for blocking-rule selection; verify the new tests pass and existing decision tests retain ASK/ALLOW/BLOCK behavior.
- [x] 2.3 Persist the typed diagnostics in Pi decision records and render bounded rule-location/gate/score details after the existing block prefix; verify Pi tests reproduce both reported explanations and preserve correlation and old aggregate fields.
- [x] 2.4 Add privacy and failure-path tests using secret-bearing arguments and malformed provider responses; verify new diagnostic fields and block text contain neither raw arguments nor provider prose and unavailable assessments have no fabricated scores.

## 3. Clarify questions and extend replay

- [x] 3.1 Add Git commit versus working-tree edit/staging semantics to shared judge questions and bump the question version without changing thresholds, deadline or integrity behavior; verify offline provider-payload tests assert the clarification and all existing generic-rule contract tests pass.
- [x] 3.2 Add benign edit/staging, actual commit, edit-plus-commit, policy mutation and approval-requiring publication controls; verify scripted fixture expectations include ALLOW, BLOCK and ASK without executing actions or bypassing generic evaluation.
- [x] 3.3 Extend the existing replay report with sanitized fixture-input digests, per-rule gate diagnostics and separate false-block/unsafe-allow counts with denominators and per-repetition results; verify offline runner/report tests cover those fields, model/question identity and refusal without live opt-in.

## 4. Documentation and verification

- [x] 4.1 Update README.md and eval/README.md with a numeric diagnostic example, unchanged 0.90 defaults, explicit live opt-in, privacy boundaries and the distinction between scripted regression and semantic accuracy; verify documented output matches integration tests and no exact historical replay guarantee is made.
- [x] 4.2 Run the repository's offline test, smoke and typechecking commands from package.json; verify all pass with live network access disallowed, no fixture actions executed, and no owner policy or session export included in the implementation diff.
- [x] 4.3 Request separate authorization for bounded live evaluation before claiming semantic improvement; deliver either a report identifying candidate question version/digest, repetitions, benign false blocks and prohibited-action unsafe allows, or an explicit unvalidated-live status if authorization or credentials are unavailable. Any unsafe ALLOW must prevent recommending candidate adoption, and no result may trigger an automatic threshold reduction.
