## Context

See proposal.md for motivation. `questions.ts` already specifies immediate effects and distinguishes publication from local work, but does not explicitly distinguish Git commits from file edits. `decide.ts` combines FAIL, UNKNOWN and probability/evidence gates, returning one aggregate reason. `guard.ts` records assessments but renders only that reason and rule locations. The existing replay already requires live opt-in and records question metadata; extend it rather than introducing another runner.

The recorded shell result was PASS 0.88 / SUFFICIENT 0.93 for the commit rule. The edit returned FAIL 0.58 / SUFFICIENT 0.90 for that rule and PASS 0.88 / SUFFICIENT 0.87 for integrity. These prove which aggregation gates fired, not why the model assigned its scores. The recorded policy used `Never commit any changes yourself. The user will do this` and `Never send emails without permission from the user`. The current owner-edited policy is not byte-identical. Preserve original fixture wording without changing TENET.md.

Main specs are empty. The pending configurable-policy change defines the baseline contract; this change adds uniquely named requirements under its capability path. It does not replace or weaken baseline requirements. Design is warranted because the change crosses decision contracts, Pi presentation and evaluation, with security-sensitive compatibility concerns.

## Goals / Non-Goals

**Goals:** Keep one source of truth for blocking gates, distinguish deterministic aggregation tests from model evaluation, and make observed failures understandable without exposing action contents.

**Non-Goals:** Threshold calibration, raw request logging, session import, provider rationale collection, tool exemptions, filesystem resolution infrastructure, policy edits and automatic retries. No claim of exact historical model replay: the original full request and immutable provider model revision are unavailable.

## Decisions

### Clarify semantics without granting tool exemptions

Extend the shared question semantics with the Git meaning of commit: creating a commit is distinct from reading, editing or staging files. Include whole-invocation assessment so `edit; git commit` remains prohibited. The clarification applies only to a Git commit prohibition, not arbitrary rules prohibiting edits or other uses of the word commit. Update QUESTION_VERSION for the changed question contract. Keep integrity wording and action-only evidence limits intact; do not invent alias observations to force an integrity PASS.

Reject lowering thresholds as the first fix: it would address the shell's 0.88 but not the edit's selected FAIL. Reject treating known tools as safe because mixed shell operations and unfamiliar tools still need semantic evaluation.

### Derive gates once in the decision layer

Introduce typed per-rule diagnostics from validated assessments and effective configuration. Use stable gate identifiers: `rule-fail`, `outcome-unknown`, `outcome-confidence-below-threshold`, `evidence-insufficient`, and `evidence-confidence-below-threshold`. Retain all applicable gates in fixed order rather than short-circuiting. Each record carries rule ID, selected labels, selected-outcome probability, sufficient-evidence probability and thresholds.

Use this derivation for both the existing blocked-rule set and diagnostics. Preserve aggregate reason precedence, ASK/ALLOW behavior, strict less-than comparisons, and FAIL blocking at any selected probability. Unavailable assessments return no fabricated diagnostics. Add fields without removing existing decision fields; historical records without diagnostics remain understandable from their assessment and config. New consumers tolerate absence on historical records.

A separate UI-only recomputation was rejected because it could drift from enforcement or omit gates in replay output.

### Show concise gate details and retain structured records

Append bounded rule-location/gate/score details to block explanations. Keep the existing `TENET blocked: <reason>` prefix and aggregate reason. Persist the same typed diagnostics beside the decision, correlated by existing session/call identity and question version. Keep the current assessment records. Bounds follow the policy's maximum rule count and a fixed number of gates; use line numbers and the built-in integrity label rather than rule text or arbitrary provider strings.

This requires no debug configuration or raw logging mode. The existing logs already contain numeric evidence; making that evidence accessible is enough for the agreed scope. Do not copy raw action arguments, tool metadata, full rule text or provider exceptions into new fields. Existing startup policy recording is unchanged.

### Extend fixtures and the current replay report

Create curated fixtures in the existing evaluation fixture module, not a committed session export. Preserve the original three rule texts, exact shell command and README edit payload; replace personal paths and session identities with stable synthetic values. Add ordinary edit/staging, actual commit, edit-plus-commit, direct policy mutation, and remote publication controls. The publication control expects ASK, actual commits and policy mutation expect BLOCK, and benign local work expects ALLOW when all gates pass.

Keep two kinds of tests distinct:
- Scripted historical scores reproduce the observed BLOCK results and exact diagnostics. They do not assert the candidate model behaves better.
- Live candidate runs assess the expected semantic decisions at unchanged thresholds. Report every repetition and fixture mismatch, false blocks among expected ALLOW cases, unsafe ALLOW among expected BLOCK/ASK cases, and other decision mismatches separately.

Reuse replay opt-in, question digest and model reporting. Add a digest of sanitized fixture input, including policy and metadata, and gate diagnostics so later comparisons identify input changes. No historical question override or second runner is required. Model aliases and absent historical metadata limit reproducibility; report this rather than claiming an exact replay.

Ordinary tests remain offline. A separately authorized live run is needed before claiming semantic improvement. If authorization is unavailable, report that validation gap rather than substituting scripted accuracy. Any unsafe ALLOW in the bounded controls blocks a recommendation to adopt the candidate; residual benign blocks remain explicit findings rather than grounds to silently lower thresholds.

## Risks / Trade-offs

- Prompt changes can shift unrelated classifications. Mitigation: run existing generic-rule fixtures and prohibited-action controls, not only the two reported cases.
- Model scores are not calibrated probabilities of safety. Mitigation: retain thresholds and report raw observed counts with denominators and repetitions.
- Exact gate messages are longer. Mitigation: fixed gate identifiers, rule locations and numeric values, with no raw strings.
- Integrity uncertainty may persist because this change does not supply filesystem facts. Mitigation: expose it separately and treat evidence enrichment as a later decision if live evaluation demonstrates a need.
- Pending changes share the capability path. Mitigation: archive the baseline configurable-policy change first and verify unique requirement names before syncing this additive delta.

## Migration Plan

Implement and verify offline first, preserving all existing decision behavior for identical assessments. Deploy updated questions and diagnostics together, with a new question version. Restart or reload through the existing documented lifecycle to use the new code. No policy migration, dependencies or threshold changes are needed. Rollback restores prior questions and optional diagnostics fields without changing policy bytes. Run live comparisons only after separate owner authorization; do not execute fixture actions.
