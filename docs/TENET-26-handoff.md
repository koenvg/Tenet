# TENET-26 handoff

## Scope and bases

This final slice adds an offline paired report to the existing `eval/` support. It does not change production selection, questions, gates, SDK or host execution. TENET-20 remains a completion tracker, not a seventh implementation slice.

- Task implementation base: `b5e3c935408f934ffdc805d6e4ad9b63c6e22d0c`.
- Original epic review base: `2320f3295c3682b5303f5e6d8c9c84685f85ea73`. TENET-21 was already in this base and has its separate historical review.
- Initial clean HEAD matched the task base. TENET-24 and TENET-25 were both `done` before mutation.
- Authored labels, scripts and inline baseline checkpoint: `bdc5195`. Candidate evaluation began after this commit. The fixture byte hash is in `eval/evidence-selection/checkpoint.md`.
- Pi `openai-codex/gpt-6.1-sol`, high reasoning, is preserved. No additional implementation worker.

## Deliverables and replay

- Readable report: [`eval/evidence-selection/report.md`](../eval/evidence-selection/report.md).
- Exact application payloads, identities, decisions and separate denominators: [`report.json`](../eval/evidence-selection/report.json).
- Fabricated fixtures and frozen authored inline snapshots: [`fixtures.json`](../eval/evidence-selection/fixtures.json).
- Offline runner: [`eval/evidence-selection-replay.ts`](../eval/evidence-selection-replay.ts).
- Public-seam/report tests: [`test/evidence-selection-report.test.ts`](../test/evidence-selection-report.test.ts).

Run from the checkout after local frozen dependencies are installed:

```sh
bun run sdk:build
TMPDIR=/tmp bun test test/evidence-selection-report.test.ts
bun eval/evidence-selection-replay.ts
git diff --exit-code -- eval/evidence-selection/report.json eval/evidence-selection/report.md
```

The runner deterministically overwrites only its two report files. It imports no provider runner or executor. It accepts no flags. `--live`, disclosure flags and action-execution flags all fail before any injected transport can be called. A future live comparison needs separate explicit owner authorization for the exact sanitized disclosure, an authorized transport implementation, returned model identities and real reported usage/latency. That runner must enforce authorization before constructing or calling transport and must never dispatch fixture actions. This command cannot perform authorized live replay today. Existing `eval/semantic-cli.ts` has its own disclosure gate; its different corpus is not a replay of this report. No live comparison occurred.

## What was measured

There are 20 paired authored cases. Both sides use current `policy-rules-v7-evidence-selection` questions, `applicability-v1`, fixed policy identities, thresholds, pending arguments, integrity and synthetic current resolver facts. Baseline representation is `authored-inline-v1` with selector identity null. Candidate snapshots use the only current selector, `bounded-history-v2`.

Baseline histories are frozen authored data, not model observations, old recordings or a reconstruction of predecessor selection. Protected current state is captured identically for both sides during replay. Large authored baselines can exceed current state limits. They are not claims that the old runtime would have admitted or submitted those requests. The gate driver calls current `decide` with the protected state and an injected script evaluating the chosen snapshot; it does not run baseline history back through current selection. Its internal preparation diagnostic is not reported as baseline coverage. Baseline unrecorded selection/loss counters stay null.

The exact-duplicate inspection request falls from 25,935 to 25,291 serialized UTF-8 application bytes, including unchanged questions. The candidate's lossless pooling counter is 935 bytes, distinct from the net paired reduction of 644 bytes because representation metadata also adds bytes. Its scripted BLOCK and uncertainty stay unchanged. Nonidentical anchored echoes save 24,302 bytes by shortening two events, with zero exact compaction. Identical oversized originals also shorten with zero pooling savings.

The context-loss control loses two observations, saves 52 request bytes and changes a selected FAIL into uncertainty-only BLOCK. It remains an authored violation and a protected case. No improvement is credited. Several no-history rows grow by 193 bytes; the context-retained row grows by 385 bytes. Size increases are visible, not filtered out.

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| Authored violations | 7/20 | 7/20 |
| Validated assessments | 17/20 | 17/20 |
| Validated selected violations | 7/17 | 6/17 |
| Uncertainty-only blocks | 8/17 | 9/17 |
| Unavailable | 1/20 | 1/20 |
| Invalid | 1/20 | 1/20 |
| Skipped | 1/20 | 1/20 |
| Approval requirements | 1/17 | 1/17 |
| Unsafe allows | 0/19 protected cases | 0/19 protected cases |
| Benign blocks | 0/1 benign case | 0/1 benign case |
| Protected unassessed | 3/19 | 3/19 |

These are mechanical verification only. Scripts do not measure semantic accuracy or calibration. Provider token usage, latency and returned model are null. The scripted assessment model is explicitly an offline script, not a provider observation. Request bytes exclude HTTP framing and do not estimate provider tokens.

Permission fields are explicit mechanical projections, not host-dispatch observations. ASK receives no owner approval. Observe would-decision is separate from released observe permission. Without a validated assessment, including invalid, unavailable and skipped rows, the observe would-decision is null; the conservative enforcement fallback remains separate. No action executes. Tests deliberately inject blanket UNKNOWN and incorrect PASS responses, including a protected-policy allow, and require fixed denominators and a safety-failure flag. Unsafe allows never count as an improvement.

Expected labels, fixture identities, categories and report annotations are report-only. Current call identities are shared synthetic strings, not fixture IDs. The scripted response function takes only its separately authored script and captured evidence. It does not branch on expected labels or category. Generic questions receive only policy and authenticated current facts.

All corpus content is fabricated. No owner recording archive was read. Paths are synthetic, revisions are invented, and no private session IDs, local paths, text or credentials appear in the corpus/report. That does not establish general free-text redaction safety.

## Acceptance mapping and integrated scenarios

| Acceptance or scenario | Evidence |
| --- | --- |
| Exact duplicates, nonidentical echoes, renamed/unfamiliar tools | `evidence-selection-report.test.ts`, `exact-history.test.ts`, `bounded-history.test.ts` |
| Unrelated read/transmission/mutation, compound/opaque effects | Authored corpus and report tests; `history-group-controls.test.ts`, `applicability-contract.test.ts` |
| Earlier context retained/lost, blanket-block and unsafe-allow controls | Report tests pin fixed total/protected/benign denominators and FAIL-to-uncertainty loss; `history-group-controls.test.ts` |
| Protected policy mutation, forged/stale facts, no history authority | Report corpus and applicability-unresolved assertions; `resolved-action.test.ts`, `history-group-controls.test.ts`, integrity tests |
| Fixed protected state/questions/thresholds and exact byte measures | Report tests compare both sides' protected state and questions, remeasure serialized UTF-8 payloads and deterministic replay |
| Authored origin versus selector identity, offline null provider metrics | Checkpoint, report JSON, report tests and explicit baseline limits above |
| No provider credentials, action execution or denied live disclosure | Runner has no executor/provider path; denied live arguments tested with injected transport remaining at zero calls |
| SDK, owner, archive and inspector distinction | `evidence-context-delivery.test.ts`, `evidence-context-recording.test.ts`, `exact-history-delivery.test.ts`, `history-group-delivery.test.ts`, `inspector-presentation.test.ts`, inspector component/browser suites |
| Historical contracts interpreted as recorded | `evidence-context-recording.test.ts`, `assessment-shape.test.ts`, recording-reader and inspector tests; no archive rewrite |
| Group chronology, bounded admission, source-slot uncertainty | `history-groups.test.ts`, `pi-history-admission.test.ts`, `sdk-history-capture.test.ts` |
| Enforcement invariance, current facts, WARN, approval, observe mode | Decision/applicability/resolution/approval tests and SDK/Pi smoke suites included in the complete Bun gate |

Candidate omissions report known source slots or emitted observations, not the exact number of missing eligible calls or effects. In this corpus the positive drop is two known authored observations; candidate prior-capture omissions are zero, not proof of complete capture. Unknown missing eligible-event counts are null on both sides. Integrated admission tests cover positive source-slot loss separately. Live previously-evicted observations cannot be restored.

## Original approved checklist reconciliation

The original `openspec/changes/improve-inspection-evidence/tasks.md` checklist remains unticked. This map reconciles its wording against evidence rather than mechanically asserting every original step occurred.

| Original items | Actual evidence or wording limit |
| --- | --- |
| 1.1 | TENET-21 handoff/public seams, this task base and original epic review base above |
| 1.2 | This authored checkpoint and report. Authored before this candidate evaluation, not before the earlier selectors were implemented |
| 1.3 | Earlier slices used focused `evidence-preparation`, `bounded-history`, `exact-history` and `history-groups` tests rather than putting every assertion in `trajectory.test.ts`. Their handoffs preserve red checkpoints; TENET-26 does not claim a new red against historical FIFO |
| 2.1-2.7 | TENET-21/23/24/25 handoffs, shared selection tests and documentation. Runtime excerpt fragments do not pool; complete literals elsewhere may pool. Window-local recorded groups do not authenticate execution. No unconditional new trajectory structural eviction guard |
| 3.1-3.5 | TENET-22 handoff, SDK/resolution docs, context delivery/recording tests, unchanged gate tests and exported types |
| 4.1-4.5 | Current v2/v7/schema4 writes, historical context/recording tests, assessment and inspection docs. Historical v1/v2 payloads are not reconstructed |
| 5.1-5.4 | TENET-22/24/25 inspector handoffs and component/browser assertions; stock Claude trusted owner UI remains unverified |
| 6.1-6.5 | TENET-26 authored checkpoint, runner, report tests, report artifacts and offline replay procedure. No live run or provider performance measurements |
| 7.1 | Settled integrated gate results below |
| 7.2 | Exactly one fresh-context reviewer covers the complete working-tree epic diff since the original review base, including untracked files. TENET-21 remains covered by its earlier historical review |
| 7.3 | This handoff and `inspection-evidence.md`, with scenario mapping and explicit deployed-host limits |

## Validation and sole review

Validation logs retain every attempt and exit status in `/tmp/tenet26-validation` until attached to the task. Root frozen dependencies are local to this worktree. SDK build precedes compiled-SDK Bun tests. `TMPDIR=/tmp`, existing per-test deadlines, serial commands and no arbitrary full-suite cutoff are preserved.

Initial report test was red because its implementation module did not exist. The first implementation attempt lacked local dependencies. A premature direct root TypeScript check also lacked compiled SDK output and identified the JSON import attribute; the import was corrected and SDK built before subsequent tests. These attempts are retained, not presented as passing gates. The focused report/safety/authorization/integrated checks pass 61 tests across five files.

All required gates pass on the settled integrated tree:

| Command | Result |
| --- | --- |
| `bun run sdk:build` | Exit 0 |
| `bun run inspector:build` | Exit 0 |
| `TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000` | Exit 0, final post-R1 793 tests across 81 files; initial settled run 792 |
| `bun run typecheck` | Exit 0 |
| `bun run inspector:check` | Exit 0, no errors or warnings |
| `TMPDIR=/tmp CI=1 bun run inspector:test` | Exit 0, 16 component and 26 browser tests |
| Local status-plugin `tsc --noEmit` | Exit 0 |
| Local status-plugin `CI=1 vitest run --config vitest.config.ts` | Exit 0, 18 tests |
| `bun run sdk:example` | Exit 0, offline Node example |
| `git diff --check` | Exit 0 |

The first complete browser attempt passed 25/26 and failed the unchanged schema-3 lifecycle deep-link assertion at `archive.vitest.ts:297`, where the pending finding tag did not satisfy the existing poll deadline. No assertions, timeouts, fixtures or production behavior were changed. The exact focused lifecycle case then passed with six unrelated cases skipped; the subsequent complete `inspector:test` passed 16/16 components and 26/26 browser tests. The failed attempt remains in the logs. Its cause was not captured and is not attributed to host load. This remains an intermittent-test risk, not a semantic-coverage claim.

The serial runner and per-command exit/duration manifest are `run-settled.py` and `settled-summary.json`; the combined inspector rerun has its separate log/exit file. Root dependencies used the frozen Bun lock; status-plugin dependencies used local `npm ci --offline` with its committed lock. No lock/manifest changes.

Exactly one fresh-context read-only reviewer covered the complete working-tree epic diff since `2320f3295c3682b5303f5e6d8c9c84685f85ea73`, including untracked files, and separately recorded task base `b5e3c935408f934ffdc805d6e4ad9b63c6e22d0c`. It returned request changes for one P2 report-projection finding, R1. No production authorization bypass or other actionable integrated finding was reported. The reviewer independently passed 107 offline tests across seven files and reproduced four unavailable-observe projection mismatches.

The original sole reviewer report is attached to TENET-26 as `TENET-26-completion-review.md`, unchanged, SHA-256 `041016ce95bfb3a53d4de4c9e067b0245ca371baa5c84a9bb06c719abeb5a5f2`. It is not replaced by or presented as approval of subsequent fixes.

R1 was valid. Invalid/unavailable assessments preserved enforcement's fallback BLOCK but incorrectly projected that as an observe would-decision. Current runtime observation deliberately leaves would-decision unavailable without a validated assessment. `review-r1-red.log` reproduces `BLOCK !== null`. The task-local correction now projects null for invalid, unavailable and skipped rows while preserving statuses, empty diagnostics, conservative enforcement fallback, released observe permission and no execution. New tests also preserve validated ALLOW/ASK/BLOCK would-decisions on both sides. The authored checkpoint is unchanged; both report artifacts were regenerated offline.

Implementer reruns after R1: 31 focused tests across three files pass; SDK build, complete 793-test Bun suite, typecheck, six report tests and diff check pass. Exact post-fix exits/durations are in `r1-final-summary.json`. Inspector/plugin/SDK-example gates were not repeated after this report-only correction because their production code and inputs were unchanged; their passing settled evidence remains applicable. Original failed attempts remain attached. No material cross-slice change, second reviewer or independent post-fix review occurred.

## Remaining limits and parent authority

One current selector; no runtime legacy switch. Current questions, labels, thresholds, integrity, WARN, approval and applicability gates remain unchanged. Historical schemas 1 through 3 and recorded schema-4 v1/v2 requests retain their original interpretation.

Stock Pi/Claude resolver coverage is unsupported. Synthetic complete/partial resolver tests are contract verification only. Stock Claude trusted owner UI, deployed remote BB routing, actual live provider behavior, semantic accuracy, provider token savings and provider latency remain unresolved. History completeness never certifies current effect coverage or execution success. Free-text evidence can contain secrets.

No live authorization, fixture action dispatch, push, PR, main merge, parent-worktree mutation, external package/service change, restart or unrelated process termination. Parent owns final acceptance/integration and TENET-20 status.
