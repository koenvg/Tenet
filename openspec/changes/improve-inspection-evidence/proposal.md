# Proposal

## Why

A recorded inspection call received an uncertainty-only would-block decision while roughly 20 KB of its 22 KB history repeated an earlier document and current action resolution remained unsupported. TENET needs better evidence selection and explanations without becoming a collection of domain-specific tools or weakening enforcement.

## What Changes

- Compact repeated historical content before it displaces useful observations. Preserve event identity, order, provenance, redaction and explicit omission records.
- Apply deterministic, domain-neutral history budgets so one large recent document cannot consume nearly all optional context. Keep pending arguments, policy and current authenticated facts ahead of history.
- Expose runtime-observed evidence coverage and selection diagnostics separately from model assessments and rule gates. Missing authenticated resolution is a coverage fact, not a claim that it caused every UNKNOWN result.
- Show uncertainty-only decisions without implying a violation, while keeping observe-mode decisions, permission and execution separate.
- Add sanitized paired fixtures for the reported pattern and equivalent actions under unrelated policies. Verify compaction, conservative enforcement and reporting offline; leave live semantic comparison separately authorized.
- Version the evidence representation and new recordings. Preserve historical interpretation rather than rebuilding old requests using current selection rules.

## Capabilities

### New Capabilities

- `evidence-selection`: Generic, bounded history compaction and selection with auditable provenance and omissions.
- `evidence-gap-diagnostics`: Runtime evidence context shared by SDK owner events, recordings and inspector explanations, distinct from semantic rule findings.
- `evidence-selection-evaluation`: Offline regression fixtures and separately authorized comparisons for evidence-selection changes across rule domains.

### Modified Capabilities

None. Existing rule outcomes, confidence thresholds, approval requirements, response validation and authenticated-fact requirements remain unchanged. These additions refine evidence preparation and reporting without modifying enforcement policy.

## Impact

- Shared decision and runtime modules, especially `trajectory.ts`, `judge-evidence.ts`, evidence contracts and decision diagnostics; SDK and host reporting; recording contracts; inspector reader and Svelte detail views; offline evaluation fixtures and reports.
- This change extends the current applicability contract already present in source. It complements `reduce-developer-friction` and `add-standalone-decision-inspector`; it does not revive the stale legacy-default/profile-selector design in the former change or edit either change's artifacts.
- New recordings require an explicit schema version. Existing schemas and recorded assessment contracts remain readable. No dependency upgrade or external executor-package modification is planned.
- Ordinary CI stays offline. Implementation must follow `CONTRIBUTING.md` and publish exact verification limits.

## Non-goals

- Git-specific tools, command allowlists, tool-name exemptions, domain-specific shared evaluator instructions or automatic command rewriting.
- Shipping a new executor, certifying stock Pi or Claude executors, guessing current targets from old anchors, or converting unsupported/partial facts into complete coverage.
- Lowering thresholds, bypassing policy integrity, reusing approval, executing fixture actions, or submitting private archives to an evaluator.
- Claiming that cleaner evidence alone makes the reported command allowable. Its authenticated resolution remains unsupported unless its executing host supplies valid facts through the existing generic resolver contract.
