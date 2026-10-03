# TENET-27 handoff

## Scope and status

Independent follow-up to TENET-20. This changes test fixtures and failure diagnostics, not production behavior. Implementation base is `e134b4159dacdbd351a3c4846f784c460568e2fd`, recorded with a clean worktree before mutation. The required single fresh-context review returned one P2 finding, R1. It is resolved with a retained red regression and passing post-fix validation. Ready for human review and integration; no independent post-fix reviewer approval is claimed.

No production files, contracts, schema interpretations, finding lifecycle semantics, assertions, test deadlines or production bounds changed. No live evaluator calls, owner installation changes, unrelated process termination, commits, push or PR operations occurred. Root and status-plugin dependencies were installed only in this checkout using committed locks.

## Evidence and cause

Original TENET-24 and TENET-26 validation bundles were retrieved from their task attachments. Their handoffs at integrated commit `a12fedee37e0c712130836469153776591912c0a` identify the original attempts. The new artifact bundle retains those original bundles alongside this task's logs.

### Archive readiness

The static index fixture emitted 300 begin stages, awaited default bounded drains between batches, ignored their boolean completion results, and then assumed exactly 300 records. A bounded drain is a shutdown safeguard, not a promise that every write finished. A timeout also records legitimate writer-wide health. Reading too early can see fewer stages; reading after later completion can see more than 300 records.

The controlled reproduction uses the existing writer persistence injection and real stage files/index reads. Only the first persistence operation is held for 1,200 ms, crossing the unchanged 1,000-ms default drain bound. `red-original-index-count.log` records:

- First drain returns false with one pending write and one drain timeout.
- Final close completes with 301 written records, zero pending writes, zero failures and zero drops.
- The archive contains exactly 300 begin stages and one health stage reporting that timeout.
- First index refresh reads 256 records and reports indexing in progress. Second reads 301 and finishes indexing. The original `301 !== 300` assertion fails.

This confirms a fixture cause for the extra-record failure signature without changing the index or suppressing health. The focused regression also fails before the repair with `pending: 1` and `drainTimeouts: 1`, retained in `red-archive-readiness.log`.

Other retained TENET-24 attempts included incomplete session counts, a missing second decision, and explicit unsuccessful 10-second drains. They lacked write-completion traces. The same readiness assumption exists in those fixtures, so their static setup now waits for persistence before reading or closing. The exact reason each historical write was delayed remains unknown. This task does not attribute those delays to host load, prove a disk defect, or claim that every old failure shared one cause.

### Browser deep-link readiness

`withInspector.open()` previously returned after Playwright's document `load` event. The inspector then fetched sessions, the timeline and selected detail asynchronously. The lifecycle assertion's existing Vitest poll deadline therefore included unfinished fixture setup.

A separate schema-3 pending regression delays only the linked detail HTTP response by 1,200 ms. The real reader response already has status `pending` and category `pending`. Before the repair, the unchanged finding-tag poll fails. The retained linked-page HTML says `Reading invocation`, has no finding tag, and reports no page errors. Its API log includes successful session/timeline responses but no completed linked-detail response. The original page already shows the correct pending finding. These observations establish page-load versus archive-detail ordering, not incorrect lifecycle classification.

The original TENET-26 failure did not retain the linked page or HTTP ordering, so its exact historical cause cannot be proved. The controlled test reproduces its assertion failure through the existing HTTP/browser boundary. It is independent of the writer-timeout reproduction.

## Fix and public regression boundaries

- `test/archive-fixture.ts` adds `FixtureArchiveWriter`. `settle()` follows the existing write-completion notification and requires zero failures, drops, pending stages and drain timeouts. `complete()` settles before the existing bounded close and asserts successful close. Neither method retries a drain, extends a production deadline or accepts a partial archive. The enclosing test deadline still applies if persistence stalls.
- Static index, BB thread-status, process and browser archive fixtures use this helper. Existing exact index/detail/count assertions remain. Existing explicit 10-second drain/close assertions in BB fixtures and the process writer's exact 24-record assertion remain; persistence readiness precedes them.
- `guardHarness.captured()` observes the existing public owner capture-status updates. `shutdownCaptured()` also performs shutdown once and asserts the terminal owner status is `TENET capture ON; 0 lost; drained` before static archive reads. Shutdown can enqueue new execution stages, so pre-shutdown capture alone is insufficient. Incomplete drain or loss rejects the fixture. Raw shutdown remains available for deliberate failure tests.
- `withInspector.open()` waits for rendered invocation detail for an invocation deep link before returning. Existing semantic polls remain unchanged. The new delayed-response regression asserts the pending finding, schema 3, unavailable would-decision, unknown permission and unknown execution.
- `test/archive-readiness.test.ts` checks delayed real persistence through `ArchiveIndex`, including exactly one indexed stage and no health/issues. Its overflow control requires fixture readiness to reject a dropped stage.
- Browser failures now retain unique attempt directories with response timing, errors and HTML/screenshots for every open page. A linked-page failure no longer captures only the original page or overwrites an earlier attempt.

Historical schema-1/3 fixtures still use their explicit historical writer paths. Production schema 4 and reader supported schemas remain unchanged. Lifecycle pending/dropped assertions still distinguish findings from permission, execution and would-decisions.

## Validation

All resource-heavy checks were serialized with `TMPDIR=/tmp`. Provider credentials were removed from validation subprocesses. The logs are in ignored `coverage/tenet27-validation/`; browser artifacts are in `coverage/inspector-artifacts/playwright/`.

Retained checkpoints:

- Unchanged baseline index: 13 pass. Unchanged baseline archive browser after SDK build: 7 pass.
- First baseline browser attempt: setup failure, compiled SDK export absent. No tests ran; retained separately from behavioral failures.
- `red-archive-readiness.log`: one intended failure before event-driven fixture readiness.
- `red-original-index-count.log`: original 300-record fixture reproduces 301 reads, with the timeout and health stage logged.
- `red-delayed-deep-link.log`: one intended finding-tag poll failure, plus linked-page artifacts under `failure-delayed-lifecycle-JUpUCp/`.
- `green-affected.log`: 52 pass across seven files. `green-archive-browser.log`: all eight archive browser cases pass. Initial root typecheck passes.
- First full Bun attempt: 814 pass, three module-loading errors from absent checkout-local plugin dependencies. No behavior assertion failed. Offline plugin installation lacked a cached `ws` tarball; ordinary local `npm ci` then succeeded. Both installation attempts and the failed suite remain retained; no lock/manifest change.

Repeated settled-code validation, with a separate log for every attempt:

| Checks | Runs | Result |
| --- | ---: | --- |
| Archive readiness plus complete index tests | 10 | 15 tests per run, 150 passes, zero failures |
| Original schema-3 lifecycle plus delayed detail regression | 10 | 2 tests per run, 20 passes, six unrelated cases skipped per run |
| BB thread-status, process, recording integration, standalone workflow and evidence-context delivery | 3 | 37 tests per run, 111 passes, zero failures |

Full settled-code gates, with affected checks repeated after R1:

| Command | Result |
| --- | --- |
| `bun run sdk:build` | Pass |
| `bun run inspector:build` | Pass |
| `bun test --isolate --max-concurrency=1 --timeout=30000` | 820 pass, zero failures across 84 files after R1; pre-review 818 across 83 |
| `bun run typecheck` | Pass |
| `bun run inspector:check` | Zero errors, zero warnings |
| `CI=1 bun run inspector:test` | 16 component and 27 browser tests pass |
| Status-plugin `tsc --noEmit` | Pass |
| Status-plugin `CI=1 vitest run --config vitest.config.ts` | 18 pass |
| `bun run sdk:example` | Offline example passes |
| `git diff --check` | Pass |

The full Bun log includes the previously documented Vite dependency-scan diagnostic during inspector-dev teardown; the test process exits zero and the separate built inspector suites pass. No package-release archive verification was run because production/package inputs did not change. No live accuracy, deployment or host-load claim follows from these offline results.

Exact commands, exits and durations are retained in `validation-summary.json`, `validation-final-summary.json` and `green-initial-summary.json`. `run-validation.py` records the repeat matrix and first full attempt; the final gate manifest records the dependency-corrected run without replacing that failure.

## Single completion review

The sole fresh-context read-only `delegate` run was `4b5f2d39-4eb6-4321-ae4d-242916ebb5ce`, against the complete working-tree diff including untracked files since `e134b4159dacdbd351a3c4846f784c460568e2fd`. It independently passed 52 focused Bun tests, all eight archive browser cases and diff check. Its original verdict was **request changes**, with one P2 finding, R1. The unchanged report is retained as `TENET-27-completion-review.md` in the validation artifacts.

R1 was valid. Shutdown enqueues terminal execution records after the earlier clean-capture check. The reviewer reproduced an incomplete terminal drain while every then-current `recordFixture` assertion passed. That was a controlled counterexample, not historical attribution. `review-r1-red.log` reproduces the missing rejection with a zero-pending clean pre-shutdown status followed by `incomplete drain`.

The repair adds `guardHarness.shutdownCaptured()`, used by the static Pi recording, standalone workflow and coverage-delivery fixtures. It waits for current capture, performs shutdown once and asserts the existing public terminal owner status before any static archive read. It does not retry shutdown or change disposal deadlines. Raw shutdown and raw cleanup remain unchanged for failure tests.

`test/pi-capture-readiness.test.ts` verifies that clean shutdown persists exactly one terminal execution record with outcome `unknown`. Its isolated subprocess control blocks only its own event loop for 1,200 ms after shutdown enqueues new stages and requires the helper to reject incomplete drain. The parent removes the subprocess's fixture only after the subprocess exits. No unrelated process is blocked or terminated.

`review-r1-green-focused.log` passes 54 tests across eight files. Post-fix repeated checks pass 10/10 terminal-readiness runs, two tests each and 20 passes, plus 3/3 affected recording/workflow/delivery runs, 28 tests each and 84 passes. Final post-fix SDK/inspector builds, 820 Bun tests across 84 files, root typecheck, inspector check, full 16-component/27-browser inspector run and diff check pass. Exact commands, exits and durations are in `review-final-summary.json`. Earlier plugin static/18-test and offline SDK-example results remain applicable; R1 changed only test harnesses and their callers, not those inputs.

R1 is resolved by the implementer's regression and verification, not a second reviewer attestation. No second reviewer was launched. The original request-changes report remains unchanged.
