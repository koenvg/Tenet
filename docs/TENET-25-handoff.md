# TENET-25 handoff

## Status and scope

Implementation and all required local gates pass. The sole reviewer found one P2 production-recovery blocker; it is resolved with parent-approved test-first repairs and complete post-fix validation. The original report remains unchanged, and no second reviewer ran. The task is ready for local commit and parent-owned acceptance/integration, not an integration claim.

- Child `thr_jwddrucre4`, parent `thr_29e5r6w599` coordinating TENET-20.
- Initial implementation/review base `b2b3e2f0cf6fddf3606599e3c3af1eba5f7fab31`, integrated TENET-24. Both TENET-23 and TENET-24 were verified `done`, and the initial worktree was clean.
- Approved source is PR 55 and all files in `openspec/changes/improve-inspection-evidence/`.
- Pi `openai-codex/gpt-6.1-sol`, high reasoning, remains unchanged. No extra implementation worker or second reviewer is authorized.
- Only TENET-25 is implemented. TENET-26 owns the cross-domain comparison report.
- Parent owns acceptance, integration and dependency status. No push, PR, main merge or parent-worktree mutation.

## Parent-approved grouping and admission

The parent approved these rules before mutation. Group only a nonempty recorded session+call key with exactly one observed structural call boundary in the inspected candidate window. An origin ending in `-tool-call` records that boundary. Only subsequent matching observations join the call. An earlier result, no visible call, null/empty identity, unknown session or repeated call boundary leaves independent singleton observations. Different sessions never pair. Tool names, command text, payload claims, rule labels and timestamps do not select relationships. All attempts, failures and contradictions remain distinct events. Private runtime ambiguity provenance survives reselection and immutable copies; it cannot authenticate identity or describe uninspected history.

Groups rank by latest member ingestion position, newest first. Greedy count selection retains only whole groups that fit the remaining configured event ceiling. Oversized groups are not split to use spare slots. Retained observations return to original ingestion order. Byte pressure retries uniformly halved expanded-content allowances before removing the oldest selected group. Excerpt/omission metadata counts at every retry. A group with an unrepresentable data envelope is dropped whole. This can shorten history even when fixed envelope pressure eventually requires a group drop. Generated excerpt fragments remain inline; complete strings at other paths can still pool. The pool, safe occurrences, deterministic IDs and exact savings are regenerated for each candidate and after each eviction. Pool encoding alone never changes reconstructed retained values.

Batch admission has a fixed maximum of 4,096 candidate slots, not a bound derived from `recentEvents`. SDK history and unknown raw preparation inspect the most recent suffix through fixed own data descriptors, before group selection. Invalid/accessor/sparse slots consume scan work and become prior capture omissions without invoking getters. An excluded prefix is not read. Its known slot count becomes prior admission omissions and `history-admission-window`, not an assertion that it contained valid events, a relationship or rule-material evidence. Nonzero unselected payloads are not traversed/copied/frozen. Zero history reads no slots and preserves input-length selector-drop semantics without a window claim.

Pi recovery preserves selected-branch, assessed-call and owner-record eligibility filters, then batches eligible envelopes through the same selector. Recent branch entries and nested assistant content blocks spend one combined 4,096-slot work allowance. Uninspected entry/block prefixes contribute known slot omissions; the adapter does not traverse them to count hypothetical eligible executions. SDK/recovery no longer pre-slice individual events or incrementally evict early calls before late interleaved results in the same batch. Live incremental history remains bounded and cannot recreate previously omitted calls/results. Late results without retained calls remain unpaired.

These slot limits are separate from existing content-root node/depth guards. No unconditional whole-trajectory structural cap is added. `history-content.ts` and its predecessor root-specific reference eligibility, literal escaping, runtime excerpt provenance and conditional aggregate non-regression are unchanged. Tiny-cap admission now preserves the actual invalid-versus-dropped loss counts instead of guessing from raw source length; final preparation still refuses submission when the minimal envelope cannot fit.

## Contracts, delivery and authority

Identities remain `bounded-history-v2`, `policy-rules-v7-evidence-selection`, `evidence-context-v1`, schema 4 and `applicability-v1`. This completes the approved v2 grouping semantics, not a new runtime legacy mode or representation. Historical inline/pooled payloads, recorded questions, counters and contract meanings remain untouched. No reader recomputes groups, saved bytes or decisions.

Final selection losses reach existing immutable SDK results/events, owner reports/records, schema-4 archives and inspector projections. The inspector explicitly distinguishes a shortened result from a missing result and says matching IDs do not prove execution or success. Submitted generic instructions describe window-local relationships and the same limits, without domain shortcuts or invented rationale.

Pending arguments, policy/integrity, host context and authenticated current facts remain protected. Grouping cannot promote unsupported/partial coverage, authenticate historical facts/approval or clear mixed/opaque effects. Applicability validation, distributions, thresholds, WARN/FAIL/UNKNOWN/INSUFFICIENT gates, fresh invocation-local permission and approval are unchanged. Missing execution remains unknown.

## Acceptance-to-test mapping

| Acceptance | Offline evidence |
| --- | --- |
| Generic identity/chronology selection, latest-member ranking and retained order | `test/history-groups.test.ts`: interleaved count pressure, renamed tools, descending timestamps, unknown origins, duplicate sessions |
| Whole-group count/byte removal, shortening first, oversized groups and zero history | Same file: inline byte-pressure excerpts, group-too-large count control, fixed-envelope byte exhaustion, zero/no-slot cases; unchanged bounded-history/current-capacity regressions |
| Missing/preceding results, reused identifiers, attempts/failures/contradictions stay distinct | Same file: earlier result singleton, duplicate-boundary reselection, null/empty sessions/IDs, multiple failure/contradiction values, missing calls/results, irreversible live orphaning |
| Bounded descriptor-safe batch admission and explicit intentional classifications | `test/history-groups.test.ts`: million-slot sparse raw input, exactly 4,096 descriptor inspections, higher event ceiling still capped, SDK scan-boundary orphan, unselected payload isolation, tiny-cap classification; compiled `test/sdk-history.test.ts` |
| SDK/recovery use shared path without relaxing host eligibility | `test/pi-history-admission.test.ts`: actual `registerGuard`/`nativeHistory` path, shared branch/block window, assessed IDs outside window cannot admit results, interleaved eligible groups, same-session filtering, ineligible payload isolation, decision/approval exclusion, zero/frozen-env consistency and rejected descriptors |
| Host metadata is additive negative coverage, atomic and descriptor-safe | Compiled `test/sdk-history-capture.test.ts`: omitted/zero metadata, additive SDK prefix/drop loss, flag cannot clear SDK window, malformed/missing/accessor/proxy fields, ignored arbitrary getters/toJSON, exact safe-integer boundary, combined admission/selection overflow, atomic old-history retention, detached metadata, authored markers literal and UNKNOWN still BLOCK |
| Source-slot uncertainty and live/archive parity | `test/pi-history-admission.test.ts`: known omitted raw slots without guessed nested contents, window orphan result, recording on/off, schema-4 live/archived/projected diagnostics equality; inspector browser wording calls them known omissions, not missing effects |
| Inline/pooled strings, pruning, resolvable references and exact reconstruction/savings | `test/history-groups.test.ts`: immutable pooled group pruning and independent decoder round trip; `test/exact-history.test.ts` pressure expectation now records tightening before eviction; all predecessor root-specific eligibility controls remain |
| History losses match submitted evidence, immutable owner values and schema-4 recordings | `test/history-group-delivery.test.ts`: inline/pooled shortened groups, both modes, recording on/off, late sibling isolation, injected Jev requests, SDK owner-event/report/record equality, archive/request/projection equality and Pi live failure history |
| Authored earlier-context controls expose information loss conservatively | `test/history-group-controls.test.ts`: required `r9` observation retained gives scripted FAIL, dropped gives scripted UNKNOWN; both BLOCK and omissions visible |
| Mixed/opaque effects, stale/forged fact references and stale resolver cannot improve through grouping | Same compiled SDK control suite: authenticated-partial effects, forged/stale applicability digest, stale resolver release rejection and unchanged current arguments/operation sets |
| Inspector explanation, exact recorded payload, chronology and narrow layout | `inspector/tests/browser-fixture.ts`, `debugger.vitest.ts`: actual interleaved group selection, distinct shortened/drop/prior counts, failure metadata, untouched pool JSON, unknown execution, keyboard detail access and no horizontal overflow |
| Historical contracts, invalid recordings and protected current facts | Existing evidence-context recording, assessment-shape, inspector presentation, resolution/capacity, applicability, SDK handoff and approval suites |

The controls are authored offline mechanical tests. No fixture action is dispatched, and scripted labels do not prove evaluator semantic accuracy. Reporting-only expected labels do not enter the evaluator payload.

## Test-first checkpoints and intentional changes

Ignored persistent logs are under `coverage/tenet25-validation/`, with separate attempts. Root/plugin frozen dependencies were installed only in this worktree. The plugin's generated untracked Bun lock was removed; no manifest/lock change is included.

- `red-count.log`: original individual-event slice retained an orphan `a` result alongside `b` instead of only the newest complete `b` group. `green-count.log` passes.
- `red-bytes.log`: whole-group eviction still removed `a` before attempting more content shortening. The uniform tightening fix keeps all six observations with explicit excerpts.
- `red-batch.log`: SDK pre-slicing lost the first call/result relationship before shared grouping. Shared batch admission resolves it.
- `red-recovery.log` was a passing initial two-call control, not a reproduced bug. The strengthened three-way case in `red-recovery-2.log` exposes calls lost before late results; batching resolves it without relaxing eligibility.
- `red-group-instructions.log`: eight intended failures for missing generic grouping instructions. `green-controls-delivery.log` passes 16 controls/delivery tests after adding them.
- `red-ui-explanation.log`: intended missing shortened-versus-missing-result wording. The focused `green-ui-explanation.log` passes with the actual grouped fixture.
- `red-tiny-classification.log`: tiny-cap fallback mislabeled an invalid SDK entry as a selector drop. Retaining the actual bounded empty snapshot counters fixes it without allowing submission.
- `focused-admission-1.log`: 107 passes. `focused-settled-1.log`: 167 passes across 13 files after the complete admission/control/delivery work.
- `focused-typecheck-1.log` caught test-only contextual JSON typing and owner-record field mistakes. `focused-typecheck-2.log` passes after correcting them.

Two existing assertions changed intentionally. The nonzero SDK excluded-prefix accessor is now inside the bounded scan and counts as a prior capture omission, not an uninspected count drop; it still never executes. Zero history remains unchanged. The large-identity exact-pooling pressure fixture now shortens retained strings before envelope-driven eviction and reports six shortened/six dropped observations with no fragment pool, rather than claiming zero shortening and positive savings. Structural pooling guards and literal reconstruction assertions were not weakened.

The mobile screenshot `coverage/inspector-artifacts/playwright/history-groups-mobile.png` was inspected directly. Loss counters and missing-result wording are readable without horizontal overflow. The synthetic fixture deliberately includes partial archive coverage; that is not evidence of complete capture.

## Sole review finding and approved repair

Reviewer run `e8e9f554-43ce-438d-bd49-04bbc21ce896`, fresh-context read-only `delegate` with the global review skill and unchanged model/reasoning, reviewed the complete initial-base diff plus untracked files. The original `coverage/tenet25-validation/TENET-25-completion-review.md` returns request changes for one P2 R1. It independently passes 126 tests and reproduces production Pi's unbounded native translator. It does not attest to this later repair.

R1 was valid. The bounded `recoverObservations` implementation had no production caller; Pi still used unbounded `nativeHistory`. The test-first `red-review-r1-window.log` fails because the actual adapter reads an excluded block getter. `red-review-r1-capture-metadata.log` fails because compiled SDK drops the required host omission count. Parent explicitly approved the optional negative-only metadata argument, descriptor validation, atomic rejection and safe combined counts.

The repair moves all native translation/assessed-ID discovery into the actual bounded `src/pi/history.ts` path and removes `recoverObservations` entirely. Earlier helper tests were moved or adapted to the actual translator and compiled SDK request seam, not weakened. `registerGuard` reads the same frozen-environment `readConfig` limits as its SDK guard. An optional readonly `HistoryCaptureMetadata` crosses `setHistory` using only two fixed own data fields. Host loss is additive, source-slot based and explicitly unauthenticated; false/zero is not completeness. It cannot clear SDK gaps, add identities/facts or authorize an action. Invalid/accessor metadata rejects before touching replacement history; combined overflow rejects before installation. Old history survives rejection. The new source-slot limitation disambiguates known raw slots from an unknown number of eligible events, without new fields or schema/selection/question identities. Zero native history counts known branch input slots as selector drops without reading entries/blocks or claiming a window. Owner UI record restoration is a separate owner-only path, not bounded evaluator-history admission.

`review-r1-focused-settled.log` passes the earlier 179-test checkpoint. After adding a direct production large-branch/zero-eligible-result control and mutating the actual supplied environment object to verify frozen configuration, `final-3-focused.log` passes 180 tests across 15 files. `red-review-r1-slot-explanation.log` reproduces the inspector's misleading omitted-events label; the repair says known omissions and explains source slots versus missing calls/effects. The original report stays untouched, SHA-256 `1efd95af83723f28c7765aa2fb03b310dd9b36da888d30db77bc97d0fd7d5762`. No second reviewer or independent post-fix review attestation is claimed.

## Complete validation and sole review

Pre-review `final-1-*` passed all ten gates but did not establish the production recovery bound, as the sole reviewer correctly found. Initial post-fix `final-2-*` also passes, with 786 Bun tests and all static/build/example/inspector gates; the separately retained plugin UI log passes 18 tests. The final `final-3-*` run includes the stronger actual-environment and large-branch/zero-eligible-output controls and passes every serialized gate:

- Focused admission/grouping/authority/delivery suites: 180 tests across 15 files.
- SDK and inspector builds: pass.
- Isolated full Bun suite: 787 tests across 80 files, 85.82 seconds, zero failures.
- Root typecheck and inspector check: pass; inspector has zero errors and warnings.
- Inspector components/browser suites: 16/26 tests pass.
- Status-plugin static check, six Bun integration tests and 18 UI tests: pass.
- Offline SDK example and diff check: pass.

`coverage/tenet25-validation/final-3-summary.log` records exact exit codes/durations; `run-final-3.py` records the serialized commands. `TMPDIR=/tmp` and project test deadlines are preserved, with no arbitrary whole-suite cutoff. No archive/readiness failure recurred, and no fixture/assertion/timeout weakening was needed. Existing Vite dependency-scan noise during the passing development-inspector test also appears in the pre-review full log; it was not changed as unrelated work. The rebuilt mobile screenshot was inspected again: known-omission/source-slot wording and counters remain readable without horizontal overflow.

The single original reviewer report is retained separately from implementer resolution and rerun evidence. There is no second reviewer or independent post-fix review attestation.

## Limits and parent handoff

All work is offline with injected judges/scripted transport and synthetic fixtures. No live provider/replay, saved fixture-action execution, credential disclosure, external host/package/service change, restart or unrelated process termination occurs. Stock action resolution remains unsupported; stock Claude trusted live owner UI remains unverified. No archive package release verification or live semantic/token-usage comparison is claimed. Free-text evidence can still contain secrets under existing redaction limits.

The exact local commit hash and clean-worktree confirmation will be recorded in the final task comment and parent message after validation and review gates pass. The task moves to `in_review`, not `done`; parent owns acceptance, integration and dependent scheduling.
