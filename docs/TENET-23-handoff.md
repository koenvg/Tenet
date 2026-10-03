# TENET-23 handoff

## Status and scope

Implementation and all required offline checks are complete. The sole completion review's P2 blocker and P3 typing finding were resolved test-first; the reviewer did not attest to the later fixes. This slice is ready for parent acceptance and integration, not dependency completion.

- Child `thr_i88wt8udb2`, parent `thr_29e5r6w599` coordinating TENET-20.
- Clean implementation/review base `059223ee68eea25b4f15a79f107464d1df8807bc`, integrated TENET-22. TENET-21 and TENET-22 were verified done before mutation.
- Approved source is PR 55 and `openspec/changes/improve-inspection-evidence/`.
- Model/provider/reasoning preserved as Pi `openai-codex/gpt-6.1-sol`, high.
- Only TENET-23 is implemented. No duplicate pooling, call/result group retention, tool/domain branches, command parsing, semantic ranking or fuzzy echo normalization. TENET-24/25 remain separate tasks.
- Parent owns acceptance, integration and dependency completion. No push, PR, merge, parent-worktree mutation or other implementation worker is authorized.

## Implementation

One shared selector bounds admission and final requests with serialized UTF-8 bytes. History uses at most the smaller of remaining state capacity and one third of the configured state budget, including envelopes and selection metadata. Each retained event's complete data envelope uses at most one quarter of that allowance. Default limits are 8 KiB history and 2 KiB event data; unused capacity does not enlarge an event.

Descriptor-only normalization applies credential/configured-field redaction and bounded node/depth/structural admission before copying. Large strings retain explicit Unicode-boundary head/tail excerpts with original known UTF-8 size and half-open byte ranges. Unsafe structural values receive path/reason omission metadata, not guessed sizes or outcomes. Runtime outer metadata and private provenance distinguish generated excerpts/omissions from literal authored lookalikes. Re-shortening keeps original offsets. Deeply frozen snapshots cannot change when host inputs or later siblings change.

Pending arguments, policy, integrity, host context and current authenticated facts stay protected. Optional current tool schema/description can be removed under total-state pressure. Facts or a minimal history envelope that cannot fit retain conservative insufficient-evidence/no-submission behavior. Unsupported/partial coverage, fact authentication, response validation, confidence thresholds, gates, permissions and approvals are unchanged. Missing content never proves execution or success.

Matching retained/shortened/dropped/prior-omission counters reach existing owner diagnostics, SDK events/results, Pi/Claude reports, schema-4 archives and inspector. Whole-event omissions equal selector drops plus known prior capture omissions. Exact compaction is separate and reports zero saved bytes in this slice.

## Version identities

| Contract | Current | Historical preservation |
| --- | --- | --- |
| Owner diagnostic | `evidence-context-v1` | Same diagnostic identity with recorded selection-specific shape |
| Selection | `bounded-history-v2` | Schema-4 `bounded-history-v1` remains valid, without inferred v2 counters or caps |
| Questions | `policy-rules-v7-evidence-selection` | `policy-rules-v6-applicability` remains recorded as authored |
| Assessment | `applicability-v1`, unchanged | Recorded profiles/labels remain unchanged |
| Archives | Schema 4, unchanged | Schemas 1 through 4 read without rewriting payloads |

No runtime legacy toggle. Question changes describe only generic excerpt/omission representation; pooling references are not implemented.

## Acceptance-to-test mapping

| Acceptance | Offline evidence |
| --- | --- |
| Default history/event caps, envelopes/metadata, no unused-capacity inflation | `test/bounded-history.test.ts`, default and 1/600/1400/4096/24576-byte matrices; captured requests and snapshots |
| One shared generic admission/final selector | Live/recovered tests in `test/trajectory.test.ts` and `test/bounded-history.test.ts`; compiled `test/sdk-history.test.ts` and SDK large-history delivery matrix |
| Nested/multibyte/escaped strings, original sizes/ranges, structural omissions | `test/bounded-history.test.ts`, exact head/tail/range checks, tightened ranges, depth/nodes/circular/sparse/getter cases |
| Nonidentical anchored echoes remain distinct; authored markers not authority | `test/bounded-history.test.ts`; retained TENET-22 authored-marker/private-gap regressions in `test/evidence-context.test.ts` |
| Redaction and bounded pre-copy admission | Descriptor-only getter test, credential/configured-field canaries; existing SDK excluded-prefix throwing getter and current evidence-budget tests |
| Snapshot isolation and accurate admission summaries | Immutable `Observations` snapshots, late sibling tests, prior-omission update test; observe-mode captured-request isolation in delivery matrix |
| Protected current evidence and conservative capacity failure | Full authored current-request comparisons in `test/evidence-preparation.test.ts`; current arguments under final pressure; `test/resolved-action.test.ts` facts/metadata priority and current-fact-over-capacity tests |
| Matching owner/report/archive counters with recording on/off | `test/evidence-context-delivery.test.ts`, both modes and unsupported/partial/complete facts; Pi live result history; existing Claude recording/observer-failure parity |
| V2 validator bounds and historical v1 interpretation | `test/evidence-context-recording.test.ts`, schema-4 v1 counters/raw identity unchanged, malformed v2 allowances/loss counters rejected, request identity mismatch rejected |
| Envelope safety and version-discriminated public diagnostic types | `test/history-envelope.test.ts`: live/compiled SDK/final descriptor capture, circular/object/accessor metadata and UTF-8/escaped identity caps; `test/sdk-assessment-types.fixture.ts`: required v2 counters after narrowing, impossible mixed v1/v2 history rejected |
| Inspector coverage summaries and unchanged conservative wording | `inspector/tests/debugger.vitest.ts` displays shortening/drops/prior omissions separately from zero exact compaction; existing component, assessment-shape and invalid-record tests |
| Gates, applicability, integrity, confidence, WARN, approval unchanged | Existing decision/applicability/resolution/SDK/host suites, authored current evidence and UNKNOWN decisions |

Existing tests changed only for intentional current version identities, selection summaries and v2 retention under tighter caps. Historical record fixtures and TENET-22 handoffs are preserved. The initial new checkpoint was 0 pass/7 expected failures; a later snapshot-summary checkpoint was 17 pass/1 expected failure, then fixed through the shared selector. After the first complete green validation, a direct authored-trajectory pre-copy regression was added and reproduced, then fixed by selecting bounded history before byte measurement. `precopy-focused.log` records 63 passing tests after that fix.

## Validation

Persistent local logs are under `coverage/tenet23-validation/`, ignored by Git. Each attempt has its own file. Frozen root and status-plugin dependencies were initialized locally; manifests/locks did not change. `TMPDIR=/tmp` avoids the known macOS socket path limit.

- `red-bounds.log`: 0 pass, 7 intended failures before implementation.
- `red-snapshot-summary.log`: stale admission-summary regression reproduced before correction.
- `focused-settled-1.log`: 114 pass, 0 fail across nine files.
- First complete run, `final-1-*.log`: 679 Bun tests and all broader gates pass. It predates the final authored-trajectory pre-copy fix.
- Final settled-code run, `final-2-*.log`: 680 Bun tests, 16 inspector component tests, 25 browser tests, 18 plugin tests, SDK/inspector builds, root/plugin static checks, offline SDK example and diff check all pass. Summary is `final-2-summary.log`; no arbitrary outer complete-suite cutoff was applied.
- Single fresh-context read-only reviewer `c68f1206-4b43-4e79-9533-50bd0eaed281` returned request changes with one P2 blocker and one P3 maintainability finding. Reviewer reran 117 focused tests, all pass, and made no repository changes. Original report is task attachment `01M3YVS41R22JVBJM9G4SZSW5X`.
- `review-red-envelopes.log`: 14 expected failures and 4 passes before the P2 fix. `review-final-focused.log`: 139 pass, 0 fail across ten files after fixes, including escaped/multibyte metadata regressions.
- Final post-review-fix run, `review-final-*.log`: 702 Bun tests across 73 files, 16 inspector component tests, 25 browser tests, 18 plugin tests, SDK/inspector builds, root/plugin static checks, offline SDK example and diff check all pass. The isolated public TypeScript consumer exercises the v1/v2 diagnostic fixture. Exact gate exit codes are in `review-final-summary.log`. No second review ran.
- The complete Bun log includes Vite dependency-scan messages during `inspector-dev.test.ts` server teardown (`Request is outdated`); all Bun checks and the separate complete inspector build/check/component/browser gates pass.

The first non-isolated multi-file focused command also exposed Bun's unsupported nested `node:test` registration. All later multi-file runs use the required `--isolate --max-concurrency=1`. A Pi fixture initially injected an unassessed recovered result that the host correctly excluded; it now uses a synthetic previously released call/result and inspects the current invocation. Production eligibility and assertions were not weakened.

## Single review findings and resolution

P2 found that descriptor-only content normalization did not protect the event envelope. SDK object/circular metadata could trigger `toJSON`, getters or recursive freeze; raw observations could invoke a `data` getter. `history-envelope.ts` now captures only own data descriptors, rejects nonprimitive identity/timestamp values and measures bounded primitive metadata before any payload visit or copy. Raw observation array slots use the same descriptor boundary; unexpected fields are never spread into submitted evidence. Invalid envelopes increment prior capture omissions, and valid oversized identities increment selector drops. No caller-owned object is frozen. New offline SDK/live/final regressions reproduce the original failures and pin the corrected boundary.

P3 noted independently optional v2 counters. The public `EvidenceContext` type is now a selection-version-discriminated union: v1 retains only its historical history shape, while v2 requires all six new counters. The isolated compiled SDK type fixture verifies narrowing and rejects incomplete/mixed shapes. Runtime validation and recorded historical interpretation are unchanged.

The original reviewer was not resumed and did not attest to the later fixes. Implementer test-first reproduction and post-fix required checks establish their mechanical resolution; no second review is claimed.

## Changed files

Runtime/contracts: `src/decision/history-content.ts`, `history-envelope.ts`, `history-selection.ts`, `contracts.ts`, `evidence.ts`, `evidence-context.ts`, `evidence-context-contract.ts`, `assessment-shape.ts`, `questions.ts`.

Inspector: `inspector/src/EvidenceCoverage.svelte`, `inspector/tests/browser-fixture.ts`, `inspector/tests/debugger.vitest.ts`.

Tests: `test/bounded-history.test.ts`, `history-envelope.test.ts`, `sdk-assessment-types.fixture.ts`, `evidence-preparation.test.ts`, `sdk-history.test.ts`, `trajectory.test.ts`, `evidence-context.test.ts`, `evidence-context-delivery.test.ts`, `evidence-context-recording.test.ts`; intentional current question-identity assertions in applicability/metadata/local-work/Pi/smoke/replay tests.

Documentation: `README.md`, `docs/inspection-evidence.md`, `docs/assessment-contract.md`, `docs/sdk.md`, this handoff.

## Limits and final parent handoff

All validation is offline and proves preparation/reporting mechanics, not live evaluator accuracy or provider token savings. No live evaluation/replay, saved fixture action execution, credential disclosure, external host/package change, restart or unrelated process termination occurred. Stock resolution remains unsupported; stock Claude trusted live owner UI remains unverified. Missing execution remains unknown. Free-text evidence can still contain secrets under the existing redaction model.

The exact local commit SHA and post-commit clean-worktree confirmation are recorded in the final task comment and parent handoff. This document is committed with the implementation; `git log -1 --format=%H -- docs/TENET-23-handoff.md` resolves that commit. The task moves to `in_review`, not `done`. No acceptance claim is made for dependent pooling/grouping slices.
