# TENET-24 handoff

## Status and scope

Implementation and all post-fix offline gates pass. The sole fresh-context read-only review's P2 structural-bound finding is resolved locally with test-first regressions and verification; the original request-changes report is retained. Ready for parent acceptance and integration, neither of which is claimed here.

- Child `thr_u7dn7d2dps`, parent `thr_29e5r6w599` coordinating TENET-20.
- Initial implementation/review base `8301e099e8402616b967ccad22237e19e88df698`, integrated TENET-23. Its task was verified `done` and this worktree clean before mutation.
- Approved source is PR 55 and the complete local `openspec/changes/improve-inspection-evidence/` proposal, design, tasks and specs.
- Only TENET-24 is implemented. FIFO event eviction remains current. Call/result group retention belongs to TENET-25, which follows parent integration serially.
- Pi `openai-codex/gpt-6.1-sol`, high reasoning, is preserved. No extra implementation worker is used.
- Parent owns acceptance, integration and dependency status. No push, PR, main merge or parent-worktree mutation.

## Algorithm and representation

The existing shared selector normalizes and redacts through own data descriptors, bounds expanded event content, and then pools exact complete retained sanitized strings before byte-driven eviction. `history-envelope.ts` still rejects invalid primitive identity/time metadata and oversized envelopes before visiting payloads. `history-content.ts` owns escaping and pooling; `history-selection.ts` owns snapshot selection. No second selector or semantic ranking is added.

Strings must be at least 256 serialized UTF-8 bytes and repeat exactly. A candidate is admitted only if its actual pool entry, references and pool-envelope overhead save bytes. The final actual JSON comparison confirms positive savings. The optional pool is `state.trajectory.values`, with at most 256 deterministic IDs `v0`, `v1`, etc. IDs follow eligible retained value order, not digests of original secret-bearing values. Every event keeps its envelope and original order, including distinct sessions, origins, call identities and timestamps.

A reference is `{"tenetHistory":{"ref":"v0"}}` inside `observation.data.content`. Every authored object with an own `tenetHistory` key is escaped as `{"tenetHistory":{"literal":{...}}}`. Decode the literal root as authored data, then recursively decode its children. This protects nested, malformed and stale authored lookalikes. Other data remains ordinary JSON. Selection paths address reconstructed content. Runtime-generated excerpt and omission paths come only from private provenance, never authored keys.

The parent explicitly approved narrower source-value eligibility: runtime-created excerpt head/tail text and representation metadata stay inline. Other complete strings in the same shortened event remain eligible. Nonidentical documents with identical generated tails are not merged. Identical oversized originals may be excerpted with zero savings. Authored excerpt-shaped objects remain literal and can pool their own complete repeated strings without gaining provenance or authority.

Private weak maps retain bounded expanded sanitized content beside runtime events. Admission and final reselection use those private values, never a decoder of caller-authored markers or pools. Final tightening applies expanded caps before pooling. Each eviction regenerates the pool, removes unused or no-longer-repeated entries and may renumber IDs. No runtime decoder traverses arbitrary host metadata. Count/node/depth/structural bounds, zero history, total/history budgets and conservative insufficient-capacity behavior remain enforced. Literal escaping counts against event caps and reserves wrapper nodes/depth before copy. Shared values cannot evade expanded event caps.

The review repair keeps reference accounting at the existing encoded `data.content` admission root: 4,096 nodes, depth 64, with literal wrappers included. A reference adds two nodes/depth levels; occurrences that do not fit stay inline, even if the same complete value pools at another path. Candidate counts, positive net savings, IDs and pruning use only safe occurrences. The existing excerpt-search `candidate.data` check is unchanged. For shortened content whose escaped-inline envelope passes that check, the shared node-room calculation also counts its complete `data` root, including redaction and selection metadata; depth eligibility reserves that extra root level. No new unconditional data-root guard is applied to already-over-limit inline events. The parent explicitly rejected a new whole-trajectory rejection/eviction cap: compaction compares complete escaped-inline and pooled frames, counting pool entries, event envelopes and selection metadata, and falls back inline with zero savings only when pooling would invalidate an already globally admissible inline frame. Already aggregate-over-limit inline trajectories retain the predecessor's byte/count behavior, including the 514-event high-limit fixture. No new compaction-induced shortening, omission or unavailable state is introduced.

The savings counter compares the compact snapshot with the same retained escaped-inline snapshot and identical selection metadata. Pool keys/envelope, references, JSON escaping and UTF-8 sizes count. This measures lossless representation savings only, not dropped events, missing excerpt middles or evidence that an earlier selector might have evicted. No metric claims greater authenticated coverage or execution success.

## Contract and delivery

Current identities remain `bounded-history-v2`, `policy-rules-v7-evidence-selection`, `evidence-context-v1`, schema 4 and unchanged `applicability-v1`. This completes the already-approved optional reference representation. No new identity, compatibility shim or runtime toggle is introduced. Historical v1/v6/schema meanings and TENET-23 v2/v7 inline payloads, questions and zero savings stay exactly recorded.

Existing owner diagnostics now receive the final submitted snapshot's positive `exactCompactedBytes` when appropriate. No consumer recomputes that counter. Compiled SDK results/events, Pi owner records, archives and inspector projections retain the same diagnostic. Recording-off still delivers it. The inspector summary separates exact savings from shortening, selector drops and prior capture omissions; its dock exposes the exact recorded references/pool/excerpts without decoding or rewriting historical evidence.

Generic evaluator instructions describe inline values, local references, recursive literal escapes and inline runtime excerpts. No commands, tool classes or evaluator-domain branches are added. History cannot authenticate current facts, approve actions or certify execution. Current arguments/authenticated facts, applicability labels, validation, probabilities, thresholds, WARN handling, integrity, gates and fresh invocation-local permission/approval remain unchanged. Stock resolution remains unsupported; missing results remain unknown.

## Acceptance mapping

| Acceptance | Offline evidence |
| --- | --- |
| Exact equality, 256-byte threshold, actual pool/reference savings, short/nonidentical values | `test/exact-history.test.ts`, UTF-8/escaped thresholds, exact serialized comparison and retention of 12 distinct events whose inline form exceeds 8 KiB |
| Round trip, literal/forged wrappers, authored pools and marker-shaped excerpt data | Independent bounded test decoder in `test/exact-history-fixture.ts`; captured requests and snapshot tests; no promotion of authored gap metadata |
| Admission before eviction, unused entries, deterministic IDs, 256-entry limit | Count- and byte-driven eviction tests, snapshot pruning/reassignment, 514 retained events/257 distinct repeated strings with the excess value inline |
| Expanded event caps, literal overhead, nodes/depth, tiny/zero caps, final pressure | Root-specific content/shortened-data/conditional-trajectory regressions, literal overhead, mixed eligible occurrences and metadata node accounting, plus unchanged `test/bounded-history.test.ts`, `history-envelope.test.ts`, current-fact capacity and envelope safety tests |
| Redaction before pooling, no getter/toJSON/circular metadata/freezing caller objects | Exact-history redaction/escape bounds, predecessor descriptor/envelope regressions and SDK excluded-prefix test |
| Runtime excerpt fragments inline, per-value eligibility, no nonidentical echo normalization | Nonidentical anchored-echo predecessor test, identical oversized zero-savings case, mixed complete-label/runtime-excerpt event and authored excerpt-shaped literal case |
| Snapshot/session isolation and concurrent sibling completion | Compiled SDK concurrent observe requests, reversed completion, late result/history replacement and immutable captured pools in `test/exact-history-delivery.test.ts` |
| SDK/host/live/archive/inspector parity and recording-off | Updated SDK coverage matrix across both modes, recording on/off and unsupported/partial/complete resolution; Pi injected transport, exact request archive and inspector projections |
| Recorded counters/identities, old inline interpretation | `test/evidence-context-recording.test.ts` accepts bounded nonzero savings, rejects negative/fractional savings, and preserves v1 and historical v2 inline payloads without compaction |
| Inspector summary/detail, mobile ordering and exact pool JSON | `inspector/tests/debugger.vitest.ts` exact-compaction case using actual current selector output; mobile screenshot inspected for readable counters/no horizontal overflow |
| Generic questions and unchanged enforcement | Captured injected Jev payload instructions; full decision/applicability/resolution/SDK/host suite with injected judges |

## Validation

Persistent ignored logs are in `coverage/tenet24-validation/`. Root and status-plugin dependencies were installed within this worktree using frozen setup. The plugin generated an untracked Bun lock from its existing package setup; that generated artifact was removed, and no manifest/lock change is included. All checks are serialized with `TMPDIR=/tmp`; whole-suite runs have no arbitrary 300-second cutoff and retain the project individual test timeout.

- `red-exact.log`: 6 pass, 7 intended failures before pooling implementation.
- `red-excerpt-eligibility.log`: 33 pass, 3 intended failures before the parent-approved runtime-fragment exclusion. `green-excerpt-eligibility.log`: 36 pass.
- `red-compiled-delivery.log`: setup failure because compiled SDK output was not yet built. No behavior assertion was reached. Built SDK before subsequent compiled tests.
- `red-instructions-delivery.log`: 20 pass, 1 intended generic-instruction failure before question update.
- `red-inspector-exact.log`: intended missing representation explanation failure after exact pool JSON and saved/loss counters already matched. Fixed the dock text; final complete browser run passes.
- `focused-2.log`: 109 pass across nine files at that checkpoint.
- `final-1-full-bun.log`: 724 pass. The following typecheck found two test-only typing issues, an un-narrowed historical/current counter union and an implicit-any test callback. Both were fixed without changing runtime behavior or assertions.

- `review-final-1-full-bun.log`: 726 pass, eight archive/readiness failures. `review-final-2-full-bun.log`: 733 pass, one recording-integration failure (one decision read instead of two). These failed attempts are retained; no production, assertion or timeout changes were made to pass them.
- `review-diagnose-archive-1.log`: 41 pass, one unchanged index assertion failure (301 records instead of 300). `review-diagnose-index-2.log` repeated the index failure. The fixture ignores default drain/close completion returns; drain timeouts can write additional legitimate health stages, but the actual cause of these earlier failures was not captured and is not attributed to host load.
- Temporary bounded synthetic diagnostics in the actual index fixture were removed after two passing runs, `review-index-actual-readiness-{1,2}.log`: each had 300 begin stages, no health stages, all drains/close complete, zero failures/drops/timeouts, no pending writes and exact index counts. This proves those two fixtures were complete, not why the earlier fixtures failed. The index fixture and recording/index production dependencies remain identical to the base. No permanent readiness correction was introduced without supporting failure evidence.
- `review-green-focused-3.log`: 153 pass, zero failures across 14 files, including every earlier failing archive/readiness file and recording-integration. Final complete gates were rerun only after these focused checks stabilized.
- `review-final-3-*.log` passed all then-current gates (736 Bun tests) but was superseded by a final inspection finding at the existing shortened `candidate.data` admission root. `review-red-data-root.log` reproduced the depth case; `review-red-data-roots-matrix-2.log` reproduces both depth and node/selection-metadata cases against the pre-data-root repair implementation.
- The node fixture initially used a synthetic repeated string that exceeded the existing 24-KiB structural-material bound; its test string was corrected, not the runtime bound. `review-final-4-full-bun.log` then passed 738 tests, but static checking caught an erroneous test-helper argument (limits passed as current action) and an optional-counter typing error. Those test-only mistakes were corrected; the settled root matrix was rerun red against the prior implementation and green against the final implementation.
- `review-green-focused-5.log`: 155 pass across 14 files after the complete root repair and test corrections; affected `review-typecheck-all-roots-2.log` passes. Earlier archive failures remain documented without invented attribution or permanent fixture changes.

Pre-review `final-2-*.log` gates passed all 724 then-current Bun tests and every required check. Final post-fix settled-code gates, `review-final-5-*.log`:

| Command | Result |
| --- | --- |
| `bun run sdk:build` | Pass |
| `bun run inspector:build` | Pass |
| `TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000` | 738 pass, 0 fail across 75 files, 211.14 seconds |
| `bun run typecheck` | Pass, including isolated compiled SDK consumer type fixtures |
| `bun run inspector:check` | 0 errors, 0 warnings |
| `CI=1 bun run inspector:test` | 16 component tests and 26 browser tests pass |
| Status-plugin `tsc --noEmit` and `CI=1 vitest run --config vitest.config.ts` | Pass, 18 tests |
| `bun run sdk:example` | Offline Node example passes |
| `git diff --check` | Pass |

Exact exit codes and durations are in `review-final-5-summary.log`. The Bun run includes Vite dependency-scan messages during inspector-dev teardown; all Bun tests and separate inspector gates pass. The ignored screenshot is `coverage/inspector-artifacts/playwright/exact-compaction-mobile.png`. It was read directly and shows distinct positive exact savings and shortened counts, with missing execution still unknown.

## Single completion review

The only review was run `dbd396cd-cdf5-4b3b-9202-6560ad23917a`, fresh-context read-only `delegate` using `openai-codex/gpt-6.1-sol:high` and the review skill, over the complete initial-base working-tree diff including untracked files. Its historical verdict is **request changes**, with one P2 blocker: unchecked reference wrappers exceeded the existing encoded depth/node bounds. The report is `coverage/tenet24-validation/TENET-24-completion-review.md`; its 110 focused tests passed, but the reviewer supplied additional depth/node counterexamples.

The parent approved occurrence-level conservative eligibility under unchanged bounds and conditional aggregate non-regression, not a new global selector cap. `review-red-bounds.log` reproduced four failures; `review-red-aggregate.log` then reproduced six failures with 21 controls passing. The occurrence-path encoder, node room accounting, literal-aware depth eligibility and complete frame fallback resolve these counterexamples without loss. `review-green-focused-2.log` passes 120 tests across nine files, including deep/shallow mixed values, pool pruning/IDs, whole-frame depth/nodes, already-over-limit retention, exact reconstruction/savings and compiled SDK/owner/archive zero counters. The additional literal-wrapper safe/unsafe boundary controls and all earlier failing archive files pass in `review-green-focused-3.log`: 153 tests across 14 files. The final root-specific depth/node matrix also covers shortened `data` envelopes and their selection/redaction metadata (`review-red-data-roots-matrix-2.log` red; `review-green-focused-5.log` 155 pass across 14 files). All final post-fix gates pass in `review-final-5-*.log`, including 738 Bun tests. The original report is not a reviewer attestation of later fixes; no second reviewer was launched.

## Limits and parent handoff

Offline tests establish preparation/reporting/enforcement mechanics, not live evaluator accuracy or provider token savings. No live provider/replay, saved fixture-action execution, credentials disclosure, external host/service/package change, restart or unrelated process termination occurred. No archive package release validation was run or is claimed. Stock action resolution remains unsupported and stock Claude trusted live owner UI remains unverified. Free-text evidence can still contain secrets under existing redaction limits.

After all review gates pass, the exact local commit hash and clean-worktree confirmation will be recorded in the task comment and parent message. The task moves to `in_review`, not `done`. The parent handles acceptance/integration and TENET-25 scheduling.
