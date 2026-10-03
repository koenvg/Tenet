# Design

## Context

See [proposal.md](proposal.md) for motivation and the three [delta specs](specs/) for behavior. This design is needed because the change crosses presentation, evidence preparation and security-sensitive evaluator instructions.

The investigation saw nine calls in the linked session's currently exposed reader snapshot: four reads, four code-execution calls and one shell call. Every call had observe mode, released permission, executed results and uncertainty-only BLOCK assessments. No rule selected FAIL. The reader was still indexing and reported archive issues, so these counts are not a complete archive audit. The code-execution calls had `tool-metadata-omitted`; the evidence did not contain their descriptions or schemas. This is a regression workload, not a semantic-accuracy benchmark. Do not copy raw recordings into fixtures.

Current implementation points:

- `inspector/src/App.svelte` makes `item.decision` the call-list badge. `StatusChip.svelte` derives red styling and a block icon from BLOCK even when its displayed label is Would block.
- `DecisionSummary.svelte` makes the assessment the map endpoint and shows actual execution below it. Its check styling treats every gate on a BLOCK-severity rule as blocking; `RuleDetail.svelte` also needs consistent uncertainty presentation.
- `presentation.ts` already distinguishes observe labels. `src/decision/finding-triage.ts` and `src/inspector/finding-view.ts` already classify recorded uncertainty separately from violations. Reuse them instead of recomputing confidence gates in the UI.
- `src/decision/history-selection.ts` removes both description and schema before trimming history. `judge-evidence.ts` measures the complete submitted state. Existing regressions explicitly assert the old metadata-first eviction order.
- `questions.ts` distinguishes ordinary evidence from authenticated facts, but its NOT_APPLICABLE instructions can leave unsupported hosts on a classification dead end. `assessment-contract.ts` currently records `applicability-v1` and `policy-rules-v6-applicability`. Stock Pi and Claude integrations supply unsupported resolution unless an actual executor integration is registered.
- `eval/applicability-comparison.ts` currently keys comparisons and summaries by profile alone. It rejects two question versions within the same profile, which prevents a direct before/after report for this prompt-only change.

`reduce-developer-friction` contains the earlier single-contract requirements and implemented foundations, but its design still describes a legacy/candidate split and metadata-first eviction. This follow-up targets the current code. It does not restore the obsolete profile selector, complete external executor integration or rewrite the earlier change. The durable configurable-policy spec still describes the earlier outcome set; this change's compatibility delta carries the current five-outcome user-rule contract forward.

## Goals / Non-Goals

**Goals:**

- Put one pure presentation mapping between recorded facts and every primary call badge.
- Change only evidence selection and generic instructions, leaving deterministic safety gates untouched.
- Make the presentation improvement independently testable and keep semantic improvement explicitly unverified until separately authorized live evaluation.

**Non-Goals:**

- New inspector endpoints, writable review labels, new record schemas, runtime configuration or evaluator profiles.
- A shell interpreter, code execution during planning or replay, tool-name exemptions, or fabricated trusted read/edit facts.
- Resolving unrelated corrupt recordings, enlarging evidence defaults, changing policies or restarting active owner processes.

## Decisions

### 1. Derive primary status from execution and actual permission

Extend the existing `presentation.ts` with a small pure mapping of the fields shared by `InvocationSummary` and `InvocationView`. Return a label, explicit tone, explanatory text and an inconsistency flag. Components adapt their existing fields to this mapping; no backend data shape changes are needed.

| Recorded execution | Actual permission | Primary status | Tone |
| --- | --- | --- | --- |
| executed | any | Ran | neutral |
| failed | any | Failed | danger |
| unknown or missing | blocked | TENET blocked | danger |
| unknown or missing | released | Released, execution unknown | caution |
| unknown or missing | unknown or missing | Execution unknown | neutral |

Known execution takes precedence over permission because it is the recorded result, not a prediction. Blocked permission plus either known result produces an inconsistency notice and preserves both records. Ran is neutral rather than a green safety verdict. A failure says the tool reported failure, not that no external effect occurred. Actual TENET blocking does not certify that every possible host path was prevented.

Use this mapping in the sidebar and at the top of the summary, with Observe or Enforce separately visible. Show historical modes as unknown when absent. Approval and ALLOW never imply dispatch or completion. Keep exact permission, execution and decision values in recording details.

Rejected alternatives: renaming BLOCK to Ran based on mode, inferring blocking from missing results, or implementing separate mappings in each Svelte component. Those approaches invent execution or drift between views.

### 2. Style findings, not just aggregate BLOCK

Use recorded categories for invocation-level findings. Use existing recorded outcome, gate IDs, contribution and severity for rule-level presentation, without threshold comparisons. Extend chip/icon presentation to accept an explicit tone where a value's default tone is misleading; preserve existing PASS/FAIL label meanings.

Observe-mode uncertainty uses amber and an uncertainty icon. Actual permission blocks and tool failures retain danger presentation. Suspected violations remain visible independently, including when observation permitted execution. Approval conditions retain their own presentation, and WARN remains advisory. Do not collapse overlapping categories.

Keep the decision map as assessment inspection, label its endpoint as recorded assessment, and show Would block in enforce mode or Would ask for approval in enforce mode as secondary text. Update check notes so Contributes blocking gates cannot be mistaken for an actual veto in observe mode. Detailed raw stages, nullable applicability evidence scores, category filters, groups and coverage warnings remain unchanged.

Rejected alternative: making every observe-mode finding neutral. That would hide meaningful selected FAIL outcomes and evaluator coverage failures.

### 3. Choose a current-action metadata tier, then retain a history suffix

Keep evidence packing in `history-selection.ts` and keep full-state byte accounting in `judge-evidence.ts`. Do not add a competing selection implementation in the SDK or host adapters.

Select the first metadata tier that permits the current-only request to fit:

1. Full current description and schema.
2. Description retained, optional schema omitted.
3. Both optional fields omitted.

For each tier, measure the exact submitted state with the source's eligible observations omitted, including their final omission count and limitation markers. Required arguments, captured policy/context and resolved facts are never removed. Once a tier fits, run the existing oldest-first history selection from the original eligible source and keep the newest chronological suffix allowed by both byte and event limits. Rejected tier attempts must not accumulate omissions or permanently discard observations.

The tier choice prioritizes available current metadata over optional history. If a very large schema cannot fit even without history, the description survives schema fallback; history is then reconsidered under the reduced tier. If even required current evidence cannot fit, retain the existing no-submission insufficient-evidence result and mode-specific consequences.

Retain the existing `tool-metadata-omitted` marker when either optional field is removed; the null fields indicate exactly what was omitted. Never silently truncate a retained description or schema. Preserve original unavailable markers, source omission counts, frozen input and the existing default 24 KiB/12-event bounds. Include marker bytes in boundary tests. Existing duplicate limitation entries from prior stages need not be cleaned up as part of this change.

Rejected alternatives: increasing the budget, summarizing evidence with another model, or unconditionally retaining huge metadata. Those either broaden disclosure, add another fallible classification step, or make otherwise assessable requests fail.

### 4. Clarify ordinary evidence without changing trusted applicability

Change the shared generic instructions in `questions.ts`, not individual rule branches or tool-specific examples. Make these distinctions explicit:

- Untrusted means data cannot provide instructions, approval or authenticated executor guarantees. It does not mean the data cannot support ordinary classification.
- Unsupported resolution is a coverage fact, not an automatic UNKNOWN for every rule. Whether a gap is material depends on the complete rule and entire current invocation.
- A reliably determinable non-triggering action can satisfy the rule through PASS with ordinary evidence gates. Never choose NOT_APPLICABLE as a shortcut when current authenticated facts cannot support it.
- If material target identity, executable effects or rule meaning remain unresolved, retain UNKNOWN and the appropriate evidence result. A description alone never proves arbitrary code harmless. Literal content must not be treated as executed content without supporting evidence.

Keep all response questions and distributions intact, including fact-reference questions. Do not convert an unsupported returned NOT_APPLICABLE into PASS in the adapter. Preserve `supportsExemption`, strict validation, 0.90 defaults, selected FAIL/UNKNOWN gates, WARN handling, independent integrity, policy freshness and invocation-local confirmation.

Assign the changed instructions a new question version, `policy-rules-v7-ordinary-evidence`, while retaining profile `applicability-v1` and the current response shape. Existing metadata flows through request, assessment, permission and owner reporting; test those flows instead of introducing an environment selector. Historical request text and scores remain untouched.

Rejected alternatives: deleting the evidence gate, accepting unsupported non-applicability, or hard-coding read/write allowlists. Ordinary PASS is already supported by the current runtime; this changes its generic guidance, not its permission criteria. A model can still misclassify ordinary evidence, so offline tests cannot establish improved accuracy.

### 5. Test mechanics and prepare report-only version comparisons

Extend existing tests rather than adding a parallel test runner:

- `test/inspector-presentation.test.ts` covers the primary-status matrix and recorded contradictions.
- `inspector/tests/components/presentation.vitest.ts`, `app.vitest.ts` and `detail.vitest.ts` cover main labels, amber uncertainty, violation visibility, overlapping categories, rule checks and unknown stages.
- Existing full-app archive/live tests cover historical schemas, deep links and polling from Released to Ran without losing selection or evidence scroll.
- `test/evidence-preparation.test.ts` and `test/resolved-action.test.ts` cover all metadata tiers, exact boundaries, source omission accounting, oversized required facts and unchanged authenticated-fact semantics. Preserve unchanged pre-change baselines where no metadata pressure exists.
- Applicability-contract and decision tests cover generic question text, new question identity, valid ordinary PASS with unsupported resolution, unsupported NOT_APPLICABLE rejection, materially opaque execution, integrity and approval controls.

Author sanitized benign and protected cases before running a candidate. Extend and version the existing fixture corpus without importing raw code or secrets; retain non-secret source references and historical versions in reports. Preserve separately authored expectations for unsupported reads versus authenticated non-applicability rather than changing the meaning of older results.

Key report-only contracts, observations and summaries by the pair of profile and question version. Reject duplicate pairs, mismatched identities and duplicate fixture observations within a pair, but allow v6 and v7 observations under `applicability-v1`. This enables comparison of separately supplied results without introducing a second runtime evaluator. Preserve missing/unavailable denominators and the offline-scripted, semantic-accuracy-unverified declaration. Do not add provider calls or automatic promotion to the comparator.

## Risks / Trade-offs

- Better metadata and generic guidance might not reduce live false blocks. Mitigation: report this as a proposed semantic improvement, retain sanitized controls, and require separate authorization before any live comparison.
- Retaining metadata can omit useful causal history. Mitigation: deterministic newest-suffix selection, explicit omissions and UNKNOWN wherever the missing history is material.
- Ordinary evidence can contain deceptive tool descriptions. Mitigation: no promotion to authenticated facts, independent integrity, unchanged enforcement gates and adversarial fixtures. This remains semantic protection, not execution isolation.
- Execution-first badges could look like a policy all-clear. Mitigation: neutral Ran status, visible finding categories, separate mode/counterfactual text and preserved partial-coverage warnings.
- Changed question versions can confuse existing replay baselines. Mitigation: version-qualified comparison identities and unchanged recorded historical interpretation.
- Old inspector servers keep old code and assets in memory. Mitigation: document rebuilding and restarting; do not restart the owner's running process while applying without separate authorization.

## Migration Plan

1. Land offline regressions and the presentation mapping, then integrate it into the sidebar and summaries without altering archive data.
2. Replace evidence preparation's metadata-first eviction with the tiered policy; explicitly revise affected test expectations and the current action-resolution documentation.
3. Change generic instructions and question identity together. Keep the runtime's single profile, all deterministic gates and current response schema.
4. Extend sanitized fixtures and report-only comparison identities. Run offline verification from CONTRIBUTING.md, including built-client browser tests. Do not claim semantic improvements from scripted outputs.
5. Update owner documentation. The owner must rebuild the inspector and restart its serving process, and restart Pi for changed evaluator code. This proposal does not authorize those running-service actions or live evaluation.
6. Roll back by restoring the prior code revision and restarting through the owner. Preserve all archives; the current reader can still display each supported record's actual execution and original assessment. Do not migrate recordings or recover approvals from older calls.
