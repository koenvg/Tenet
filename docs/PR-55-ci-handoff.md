# PR 55 CI fix

## Failure and scope

The Guard and types job failed in the concurrent-approval section of the pinned Pi smoke test. It expected the first submitted invocation, with payload value `one`, to execute after the first positive confirmation. The displayed invocation was instead `two`, whose assessment reached the approval queue first. Parallel assessments do not guarantee dispatch-order dialog arrival.

The original test reproduced the CI assertion locally on the eleventh smoke run. This fix changes the test harness and assertions only. It does not change runtime approval order, enforcement, evaluator behavior or the proposed inspection-evidence feature.

## Test behavior

The existing real-Pi smoke seam remains in use: loaded extensions, overlapping native tool-call hooks, an injected offline judge, native confirmation callbacks and the loaded dummy executor.

A deferred judge response forces each possible assessment completion order. The test verifies that both calls remain withheld before consent, that each dialog names the intended payload, that positive consent releases only the displayed invocation, and that denial prevents the other invocation from executing. Argument mutation, cancellation, lifecycle invalidation and restart checks remain present.

With the old fixed `one` expectation left in place, the forced reverse-order case failed deterministically. Replacing it with the scenario's independently specified approved payload made both orders pass. No timing delay or retry hides the failing assertion.

## Validation

- SDK and inspector builds passed.
- Updated smoke suite passed 20 consecutive runs, with both approval orders exercised in every run.
- Focused approval lifecycle, owner delivery and Pi/SDK parity checks passed: 26 tests.
- Full isolated Bun suite passed: 556 tests, zero failures.
- Project typecheck and inspector check passed; Svelte reported zero errors and warnings.
- Inspector component browser tests passed: 16 tests. Inspector end-to-end browser tests passed: 24 tests.
- BB status plugin typecheck and Vitest suite passed: 18 tests.

The broad local checks used `TMPDIR=/tmp`. The context-mode harness otherwise adds a long temporary-directory prefix, causing three unrelated Claude socket fixtures to exceed their existing socket-path safety bound. The short temporary directory makes those fixtures pass without changing or bypassing the runtime safety check. GitHub's original Linux failure was the approval-order assertion, not a socket-path failure.

Validation used Bun 1.3.14 and Node 24.14.0 on macOS. GitHub validates its Linux and Node 22 environment after the fix is pushed. All evaluator traffic and proposed fixture actions remained offline.

## Completion review scope

Review the complete CI-fix diff, including this handoff, against pre-fix commit `f2d9cbbf5b832c5d19ce8ea1ef03763296fe7cf5`. The previously approved OpenSpec artifacts are already in that baseline and are unchanged by this fix. Review and remote CI outcomes are recorded in the PR discussion.
