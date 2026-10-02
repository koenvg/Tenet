# Inspection evidence preparation

TENET-21 centralized preparation, TENET-22 added owner-only runtime coverage diagnostics and schema-4 reporting, and TENET-23 bounds oversized history at base `059223ee68eea25b4f15a79f107464d1df8807bc`. The approved source is [PR 55](https://github.com/koenvg/Tenet/pull/55). Duplicate pooling and call/result group retention remain TENET-24/25 work and are not implemented here.

## Shared contract

`src/decision/history-selection.ts` owns admission, immutable snapshots and the single current FIFO selector. `history-envelope.ts` captures own data descriptors, validates primitive identities/timestamps and bounds envelopes before visiting content. `history-content.ts` owns descriptor-only bounded normalization and excerpts. Both live/recovered `Observations.add` and SDK `addHistory` use these modules. Recovery adapters choose the eligible branch and provenance; the SDK checks readiness and activation before replacing history. Neither adapter has its own content selection rule.

`boundEvidence` delegates final preparation to `prepareRequest`, supplying the byte measurement of the exact `judgeState` projection. Preparation protects policy, integrity, host context, pending arguments and current resolved facts. Optional current tool description/schema may be removed under total-state pressure. Protected facts are never truncated; if they or the minimal history envelope cannot fit, `decide` returns the existing conservative `BLOCK / insufficient-evidence` without calling the judge.

The existing configuration stays at 12 recent events and 24 KiB serialized state by default. The history allowance is `min(floor(maxBytes / 3), remaining bytes after protected current evidence)`. It includes the complete trajectory envelope, observation envelopes, omission/excerpt metadata and selection summary. Each retained event's complete `data` envelope is at most `floor(historyAllowance / 4)`, a stricter bound than its text alone. Defaults therefore permit at most 8 KiB history and 2 KiB per event. Unused history capacity never enlarges an event.

Admission uses the same one-third/one-quarter bounds before current evidence is available. Final preparation can only tighten them. The selector bounds content before dropping oldest individual events, keeps retained order and provenance, and honors zero recent events. No pooling or call/result group retention is claimed. Zero history submits no observations or values pool, but retains its bounded envelope and aggregate omissions. If even that envelope cannot fit a tiny cap, preparation fails conservatively.

Normalization traverses only own data descriptors, never authored getters. Before copying, it bounds traversal to 4,096 nodes, depth 64 and 24 KiB of structural material. Sparse, circular, image, unsupported and oversized structural values receive explicit omissions. It reuses credential/configured-field matching from current-action redaction. Very large strings can be excerpted without copying their full contents. SDK ingestion counts the count-excluded prefix without reading it; invalid entry envelopes count as prior capture omissions. All retained SDK/live/recovered data uses the same content bounds.

### Excerpt representation

Small sanitized values stay literal in `observation.data.content`. A runtime excerpt replaces a string there with `{"tenetExcerpt":{"head":"...","tail":"..."}}`. The runtime-owned outer `observation.data.selection.excerpts` contains its path, original UTF-8 byte size and two half-open retained byte ranges. Head and tail end at Unicode boundaries. The missing middle is explicit; JSON escaping and all metadata count against the serialized-byte cap. Subsequent tightening preserves the original size and offsets rather than calling an earlier excerpt complete. Structural omissions have paths and reasons in `data.selection.omissions`; no original size is guessed when unavailable.

Only paths in that runtime-owned outer selection describe generated excerpts or omissions. Authored lookalike objects remain literal inside `data.content` and cannot create selector authority or private runtime gap provenance. Private weak maps preserve normalization gaps and excerpt provenance across final immutable copies. The maps are not serialized. Submitted representation metadata describes missing content, not authenticated action facts.

Each final trajectory carries `selection.version: bounded-history-v2`, effective history/event allowances, retained and shortened event counts, selector-dropped events, prior capture omissions and `exactCompactedBytes`. The latter is always zero in TENET-23. `trajectory.omitted` is dropped plus prior omissions; content loss within a retained event is not a whole-event omission. Exact compaction is separate from loss and belongs to TENET-24. Missing content never proves that an operation ran or succeeded.

Order means ingestion or selected-branch order, not timestamp sorting. Deeply frozen copies stay detached from host content; later sibling results cannot change an in-flight request. Final preparation does not mutate admission snapshots. Runtime ownership and lifecycle invalidation remain unchanged.

## Evidence is not authority

Preparation never rewrites pending arguments or current resolved facts. It cannot promote a historical `authenticated-complete` claim into top-level `resolvedAction`, nor turn a historical approval into invocation-local permission. Only the configured trusted resolver can authenticate current facts. Stock Pi and Claude adapters still report unsupported resolution; cleaner history does not certify execution effects.

The `applicability-v1` contract, integrity checks, WARN handling, FAIL and UNKNOWN gates, outcome/evidence-confidence thresholds, INSUFFICIENT gate and applicability validation are unchanged. Enforcement still requires fresh policy and unchanged invocation identity/arguments. ASK still requires trusted approval for that invocation. Observe mode still permits independently of its counterfactual findings.

## Regression seams

The task acceptance criteria establish these offline test boundaries:

- Captured injected-judge requests and resulting decisions through `decide` and the Pi/SDK guard entry points.
- Immutable `Observations.snapshot()` values, including unsupported-content markers and missing metadata.
- Compiled SDK `setHistory` admission and permission/assessment results. No fixture tool action is dispatched.
- Existing owner-event, recording and inspector projections in the broader required suite. TENET-21 added no projection fields or record versions; TENET-22 adds the owner-only diagnostic and schema 4.

`test/evidence-preparation.test.ts` keeps authored current-state baselines for count limits, zero history, UTF-8 pressure, chronological recovery and conservative capacity failure. TENET-23 intentionally versions smaller retained-history expectations and checks the new selection summary separately. `test/sdk-history.test.ts` pins SDK provenance, omissions, redaction, missing metadata and permission/assessment outcomes, including a throwing getter in excluded history.

## Runtime evidence context

`src/decision/evidence-context.ts` derives the completed `EvidenceContext` once from the immutable, final prepared request. `boundEvidence` attaches it to the owner-facing request wrapper; `judgeState` excludes it from evaluator evidence. Selection stays generic and FIFO. The new questions explain only the versioned representation. There are no new gates, probability overrides or permission exemptions.

- `version: evidence-context-v1` identifies the owner diagnostic. Current selection is `bounded-history-v2`; current questions are `policy-rules-v7-evidence-selection`. The assessment remains `applicability-v1`. Schema-4 records from TENET-22 retain `bounded-history-v1` / `policy-rules-v6-applicability` and their original counter shape. Readers do not infer v2 counters or apply v2 caps to those historical records.
- `preparation` is `completed` only after required current evidence fits. It is independent of evaluator availability. Provider errors, invalid responses and timeouts can have completed preparation and no valid assessment.
- `resolution.status` is `unsupported`, `authenticated-partial`, `authenticated-complete` or `unavailable`. The first three copy the captured resolver status, with unsupported defaults when there is no registered resolver. Unavailable means capture/preparation did not establish that status. Complete history never upgrades effect coverage.
- `current.redactedFields` counts removed fields across current arguments/tool metadata and current resolved facts. Current limitations and resolver limitations come from their sanitized captured values. No paths, arguments, operation contents or guessed model rationale are added to the diagnostic.
- Completed `history` records event/state limits, effective history/event byte allowances, retained events, serialized UTF-8 trajectory bytes, shortened events, selector-dropped events, known prior omissions and exact-compacted bytes. It also records bounded captured limitations and private normalization gaps from retained events. Whole-event `omittedEvents` equals dropped plus prior omissions. No counter claims complete external history, execution or future pooling/group retention.
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

## TENET-23 regression seams

- `test/bounded-history.test.ts`: default and tiny caps including metadata, nested/multibyte/escaped strings, nonidentical anchored echoes, safe original ranges, zero history, bounded nodes/depth, circular/sparse/getter omissions, redaction, literal lookalikes, final tightening, current-argument capacity and immutable admission summaries.
- `test/history-envelope.test.ts`: compiled SDK, live admission and final preparation reject accessor/circular/object-valued metadata, invalid timestamps and oversized UTF-8/escaped identities without touching or freezing caller objects. Unknown envelope fields and array slot accessors never become submitted evidence.
- `test/evidence-context-delivery.test.ts`: large shortened SDK history across both modes, recording on/off and unsupported/partial/complete facts, listener failures, live Pi result ingestion and live/archive equality.
- `test/evidence-context-recording.test.ts`: v2 loss-counter/allowance validation, schema-4 v1 preservation without new counters, request identity agreement and existing unavailable/Claude archive paths.
- Existing resolution tests preserve complete authenticated facts and optional-metadata priority, and prohibit submission when current facts cannot fit. Existing applicability, confidence, WARN, integrity and approval tests pin enforcement. The Svelte browser suite displays shortening/drop/prior-omission counts separately from zero exact compaction, beside unchanged decision/coverage wording.

These tests establish offline preparation and reporting mechanics, not semantic accuracy. TENET-24/25 criteria remain incomplete. The acceptance map, base, validation logs and single review outcome are recorded in [TENET-23 handoff](TENET-23-handoff.md).
