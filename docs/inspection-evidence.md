# Inspection evidence preparation

TENET-21 centralized preparation without changing submitted evidence or enforcement. TENET-22 adds owner-only runtime coverage diagnostics and schema-4 reporting at base `2320f3295c3682b5303f5e6d8c9c84685f85ea73`. The approved source is [PR 55](https://github.com/koenvg/Tenet/pull/55). New history caps, duplicate pooling and call/result group retention belong to TENET-23/24/25 and are not implemented here.

## Shared contract

`src/decision/history-selection.ts` owns history normalization, credential omission, configured sensitive-field redaction, SDK admission, immutable snapshots and FIFO selection. It has no command vocabulary, rule-text classification or tool-name exemptions.

`Observations` in `trajectory.ts` is the host-facing collection interface. Live observations and recovered branch events use `add`; caller-supplied SDK history uses `addHistory`. Both delegate to `HistoryPreparation`. Recovery adapters still choose the eligible branch and event provenance. The SDK still checks session readiness and activation before replacing history. Neither adapter implements selection rules.

`boundEvidence` in `judge-evidence.ts` delegates final preparation to `prepareRequest`. It supplies only the byte measurement of the exact `judgeState` projection. The same private FIFO selector handles event-count and byte eviction at admission and final preparation. Final preparation does not mutate retained history.

Preparation preserves the existing phases and allowances:

1. The default limits are 12 recent events and 24 KiB. An observation normalizes unsupported content to explicit markers, omits credential fields and applies configured redactions. If its sanitized payload exceeds the byte allowance, it becomes `observation-byte-limit`. Admission drops oldest events until the observation array fits the count and serialized UTF-8 byte limits.
2. SDK history retains its existing bounded inspection behavior. The excluded prefix counts as omitted without reading it, including with zero retained events. Unsupported entry kinds and raw entries rejected by `evidenceWithinBudget` count as omitted. Oversized SDK entries are excluded, not converted to the live oversized-observation marker. This difference is preserved inside the shared module.
3. Final preparation first applies the event count. If the exact submitted state is too large, it drops optional tool description and schema before history. It then drops oldest observations until the state fits. The byte measurement includes policy, integrity text, current action and resolved facts, not just the history array.
4. If required current evidence still cannot fit with zero history and no optional tool metadata, preparation returns `null`. `decide` returns `BLOCK` with `insufficient-evidence` and does not call the judge.

Order means ingestion or selected-branch order, not timestamp sorting. Provenance, timestamps and omission counts remain intact. Copies are deeply frozen and detached from host content; later events cannot alter an in-flight request. Existing limitation order is unchanged, including duplicate `history-omitted` markers when both phases omit events. Runtime session/context ownership and lifecycle invalidation remain unchanged.

## Evidence is not authority

Preparation never rewrites pending arguments or current resolved facts. It cannot promote a historical `authenticated-complete` claim into top-level `resolvedAction`, nor turn a historical approval into invocation-local permission. Only the configured trusted resolver can authenticate current facts. Stock Pi and Claude adapters still report unsupported resolution; cleaner history does not certify execution effects.

The `applicability-v1` contract, integrity checks, WARN handling, FAIL and UNKNOWN gates, outcome/evidence-confidence thresholds, INSUFFICIENT gate and applicability validation are unchanged. Enforcement still requires fresh policy and unchanged invocation identity/arguments. ASK still requires trusted approval for that invocation. Observe mode still permits independently of its counterfactual findings.

## Regression seams

The task acceptance criteria establish these offline test boundaries:

- Captured injected-judge requests and resulting decisions through `decide` and the Pi/SDK guard entry points.
- Immutable `Observations.snapshot()` values, including unsupported-content markers and missing metadata.
- Compiled SDK `setHistory` admission and permission/assessment results. No fixture tool action is dispatched.
- Existing owner-event, recording and inspector projections in the broader required suite. TENET-21 added no projection fields or record versions; TENET-22 adds the owner-only diagnostic and schema 4.

`test/evidence-preparation.test.ts` contains authored synthetic, complete submitted-request baselines for count limits, zero history, UTF-8 admission and final byte pressure, oversized observations, chronological recovery and insufficient capacity. These expectations passed against the pre-change implementation before the runtime refactor. They are not snapshots regenerated from the new preparer. `test/sdk-history.test.ts` pins SDK trajectory provenance, omissions, redaction, missing metadata and permission/assessment outcomes, including a throwing getter in excluded history.

## Runtime evidence context

`src/decision/evidence-context.ts` derives the completed `EvidenceContext` once from the immutable, final prepared request. `boundEvidence` attaches it to the owner-facing request wrapper; `judgeState` excludes it from evaluator evidence. Preparation and the submitted state remain FIFO and unchanged. There are no new model instructions, gates, probability overrides or permission exemptions.

- `version: evidence-context-v1` identifies the diagnostic shape. `selectionVersion: bounded-history-v1` identifies today's FIFO history representation. The assessment stays `applicability-v1` and questions stay `policy-rules-v6-applicability`. `bounded-history-v2` and `policy-rules-v7-evidence-selection` are reserved for later references/excerpts changes, not aliases for this implementation.
- `preparation` is `completed` only after required current evidence fits. It is independent of evaluator availability. Provider errors, invalid responses and timeouts can have completed preparation and no valid assessment.
- `resolution.status` is `unsupported`, `authenticated-partial`, `authenticated-complete` or `unavailable`. The first three copy the captured resolver status, with unsupported defaults when there is no registered resolver. Unavailable means capture/preparation did not establish that status. Complete history never upgrades effect coverage.
- `current.redactedFields` counts removed fields across current arguments/tool metadata and current resolved facts. Current limitations and resolver limitations come from their sanitized captured values. No paths, arguments, operation contents or guessed model rationale are added to the diagnostic.
- Completed `history` records the effective event limit, total state-byte limit, retained events, serialized UTF-8 trajectory bytes and accumulated omitted events. This includes admission and final pruning. It records captured trajectory limitations and retained normalization omission/redaction gaps, including unavailable, image, circular and nested unsupported content. It does not claim complete external history, count references, or invent future compaction counters.
- Each limitation list is deduplicated, capped at 16 entries and 128 UTF-8 bytes per entry. `limitationsTruncated` makes that loss explicit. Original sanitized evidence remains inspectable. Privacy follows existing field redaction; free-text source and limitation strings can still contain secrets.

History normalization records its own gap provenance in a private weak map and preserves it across the final immutable request copy. The map is not serialized into evaluator state or archives. Authored objects with `tenetOmission` keys cannot create runtime provenance. Only retained events contribute their content gaps; `omittedEvents` still counts whole excluded events, not missing content within retained events.

Pending, dropped, cancelled and early failures have unavailable preparation and null final history counters. Capacity failure can retain captured current coverage/redaction without claiming final history preparation. Completed results carry the same deeply frozen value through consequences, SDK assessment results/events, Pi live reports/native recovery, Claude programmatic owner records and archives. Recording-off suppresses local archives, not live diagnostics. Archive and listener failures are best effort and cannot authorize an action.

## Recorded and inspector explanations

New writes use recording schema 4, with the diagnostic on request, assessment, decision, permission and assessment-status stages. Requests also record the selection identity outside the submitted payload. Schema-4 readers validate known identities, shape and bounds. A standalone writer receiving no prepared diagnostic writes explicit unavailable preparation, never reconstructed counters. Schemas 1 through 3 remain supported historical formats with unchanged recorded payloads, thresholds, question and assessment identities. Missing historical context is `Not recorded`, not complete coverage. A reader older than schema 4 must report unsupported schema; rollback must not rewrite archives.

The inspector uses recorded context, preferring finalized preparation over an earlier pending value. It never recomputes a decision. An uncertainty-only BLOCK shows "No rule was classified as violated" only when the policy's full rule set, integrity result, valid distributions and recorded successful validation and assessment are present, with no selected FAIL. The explanation says "would block" in observe mode and explicitly is not a safety guarantee. Invalid or missing assessment stages, malformed rule results and FAIL prevent the statement. Coverage gaps and UNKNOWN/INSUFFICIENT choices appear separately; neither proves the cause of the other.

The browser-safe `src/decision/assessment-shape.ts` checker is shared with runtime validation. It checks the recorded contract's complete rule identities, profile, distributions and bounded applicability-reference shapes without authenticating exemptions or recalculating gates. Recorded validation issues or failures on assessment, validation, decision or lifecycle stages suppress the affirmative statement. Unprofiled historical assessments use the legacy structural contract while retaining the `legacy (historical)` display label; unknown recorded contracts stay conservative.

Resolution and history coverage appear beside the existing explanation, above the detail dock at narrow widths. Bounded limitations and exact diagnostic JSON remain in the evidence dock alongside untouched submitted evidence. Permission, approval, would-decision and execution remain independent. Released permission without a captured result still means unknown execution. Stock Pi/Claude resolution stays unsupported. The Claude programmatic callback does not add a trusted live owner UI to the stock CLI.

## TENET-22 regression seams

- `test/assessment-shape.test.ts`: shared runtime/recorded structural rejection, immutable archived inspection and structural validity without exemption authentication.

- `test/evidence-context.test.ts`: immutable captured-request diagnostics, redaction, omitted history, UTF-8 limitation bounds, unavailable preparation and prepared-but-unavailable assessment.
- `test/evidence-context-delivery.test.ts`: compiled SDK results/events and owner records across both modes, recording on/off and unsupported/partial/complete coverage; Pi live/archive equality; listener failure and unavailable SDK results.
- `test/evidence-context-recording.test.ts`: schema-4 malformed/unknown diagnostics, historical schema availability and unchanged interpretation, Claude live/archive parity, recording-off and disk/listener failures, unchanged protocol responses.
- `test/inspector-presentation.test.ts` and `inspector/tests/debugger.vitest.ts`: conservative completeness checks, uncertainty versus FAIL, unavailable/not-recorded states, observed execution, keyboard focus and mobile ordering. The existing evidence-preparation baselines now compare the exact request excluding the new owner-only diagnostic; their submitted content expectations were not regenerated.
- Existing decision, applicability, resolution, approval, SDK handoff, recording-failure and Pi parity tests pin unchanged enforcement mechanics. No stored or authored fixture action executes during these diagnostic tests.

Acceptance mapping, exact checks, review outcome and limits are in [TENET-22 handoff](TENET-22-handoff.md).

Existing trajectory, resolved-action, applicability, approval, owner-reporting and host parity tests cover frozen snapshots, session isolation, protected current facts, unsupported applicability and unchanged enforcement behavior. These offline scripted tests establish mechanical equivalence, not live evaluator accuracy.

For required checks, see [CONTRIBUTING.md](../CONTRIBUTING.md). Completion results and the single fresh-context review are recorded in [TENET-21 handoff](TENET-21-handoff.md).
