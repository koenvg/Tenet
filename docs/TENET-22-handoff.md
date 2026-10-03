# TENET-22 implementation handoff

## Status

Implementation and completion gates have passed. Ready for parent integration after the local commit; no push, PR, merge or parent-worktree change is authorized.

- Task: TENET-22, isolated child `thr_hjt5jpy8yn`, parent `thr_29e5r6w599` coordinating TENET-20.
- Original base: `2320f3295c3682b5303f5e6d8c9c84685f85ea73`, including TENET-21.
- Branch: `bb/tenet-22-explain-evidence-coverage-end-to-end-thr_hjt5jpy8yn`.
- This handoff is part of the implementation commit. The exact commit hash and final clean-worktree confirmation are recorded in the task completion comment and parent message.
- Approved source: [PR 55](https://github.com/koenvg/Tenet/pull/55), local `openspec/changes/improve-inspection-evidence/` proposal, design, tasks and specs.
- Exactly one fresh-context read-only reviewer ran. Its two P2 findings and historical-contract gap were resolved test-first. No second review ran or is claimed. The reviewer did not attest to the later fixes; post-fix tests and checks establish their mechanical behavior.

The earlier validation-blocked handoffs and logs remain historical evidence. This version supersedes their open-gate status. The task moves to `in_review` after the local commit and clean-state check. The parent owns integration and dependency status.

## Implemented scope and boundaries

The runtime derives one immutable owner diagnostic from the captured final prepared request. It records preparation availability, resolution coverage, current redaction, bounded captured limitations and final retained/omitted FIFO history counts. Preparation completion does not imply a valid assessment. Pending and early failures do not invent final history counters; failures after preparation preserve known coverage.

The same diagnostic reaches consequences, compiled SDK results/events, Pi live/native reports, Claude programmatic owner records, schema-4 archives and inspector detail. Recording-off retains live owner delivery. Archive/listener failures cannot authorize an action. The compact inspector coverage summary precedes the evidence dock at narrow widths, while the dock exposes the exact diagnostic separately from untouched submitted evidence.

The inspector's affirmative no-rule-violated statement requires complete recorded policy/integrity results, a structurally valid assessment under its recorded contract, successful recorded validation and no selected FAIL or recorded validation issue/failure. Observe wording says "would block"; permission, approval and execution stay independent. It is not a safety guarantee. Missing historical context is "Not recorded", not inferred completeness.

The parent approved only the optional in-process `startBridge.onOwnerRecord` callback. Shared immutable delivery adds no hook/socket fields, stdout/stderr output, CLI stream, trusted owner UI, resolver claim or retained report buffer. Stock Claude live owner UI remains unverified.

No new history caps, duplicate pooling, call/result grouping, domain-specific evaluator branches, command allowlists, tool exemptions or guessed model rationale are implemented. TENET-23/24/25 remain separate slices. Current facts still require authentication; gates, probabilities, evaluator questions/state, policy freshness and authorization are unchanged.

## Version identities

| Contract | Identity |
| --- | --- |
| Diagnostic | `evidence-context-v1` |
| Current FIFO selection | `bounded-history-v1` |
| Assessment | `applicability-v1`, unchanged |
| Questions | `policy-rules-v6-applicability`, unchanged |
| New recording writes | Schema 4 |
| Historical readers | Schemas 1, 2 and 3, preserving recorded payloads/contracts |
| Reserved for later tasks | `bounded-history-v2`, `policy-rules-v7-evidence-selection`, not implemented |

Limitations are deduplicated and capped at 16 entries and 128 UTF-8 bytes per entry, with truncation flags. History bytes measure serialized trajectory; `maxBytes` is the complete submitted-state allowance. Whole-event omissions remain distinct from missing content in retained events. Privacy follows existing redaction; free-text source and limitation strings can still contain secrets. Older readers must report schema 4 unsupported rather than rewrite archives.

## Acceptance mapping

| Acceptance | Offline evidence |
| --- | --- |
| Immutable bounded unsupported/partial/complete/unavailable coverage and final history counts | `test/evidence-context.test.ts`, `test/evidence-context-delivery.test.ts`, nested readonly SDK fixture |
| Owner diagnostic excluded from evaluator state; unchanged selection, gates and authority | Authored request baselines in `test/evidence-preparation.test.ts`, SDK history, decision/applicability/resolver/approval suites |
| SDK/host/archive parity, recording off, unavailable assessment and listener/capture failures | `test/evidence-context-delivery.test.ts`, `test/evidence-context-recording.test.ts`, Pi/Claude owner delivery and existing host suites |
| Schema 4 validation and schemas 1 through 3 preserved | `test/evidence-context-recording.test.ts`, historical recording, BB finding and index fixtures |
| Conservative no-violation wording with independent permission/execution | `test/inspector-presentation.test.ts`, `test/assessment-shape.test.ts`, inspector browser suite |
| Runtime content-loss provenance without trusting authored markers | Captured-request and compiled SDK gap regressions; oversized-observation baseline |
| Narrow-screen summary readability and exact dock detail | `inspector/tests/debugger.vitest.ts`; inspected synthetic `coverage-summary-mobile.png` and mobile/desktop screenshots |
| Required validation and single completion review | Final gate results and reviewer resolutions below |

## Focused archive diagnosis and historical failures

Fresh logs are in `coverage/tenet22-validation/resume-20261002-183524/`. Original logs remain in `coverage/tenet22-validation/`, including `tenet22-full-tests.log` and `tenet22-final-ui-tests.log`. No files or work were discarded during resumption.

All original narrow failure selections passed unchanged after fresh SDK/inspector builds. Logs: `pi-entry-1.log`, `recording-health-1.log`, `index-counts-1.log`, `background-finding-1.log`, `pi-smoke-1.log`, `browser-older-session-1.log`, `browser-live-1.log`, `browser-coverage-1.log`.

The old failures were classified separately:

- Archive browser first page expected 50 sessions, got 41. The seed authors 53 sessions and ignored `drain()`/`close()` booleans. Awaiting the seed before inspector startup therefore did not prove complete capture.
- Live polling failed inside `recordFixture` before browser assertions: one archived request instead of two. Its `assessed()` helper accepts any non-pending terminal status. Pi shutdown captures the close boolean internally, but does not return it to that harness. The failed run did not identify the missing request or log transport counts/health.
- Fresh live selection had a separate 20-second timeout. The debugger `beforeAll` had a separate 30-second hook timeout and skipped 14 tests. Neither stack measured the failing substep.
- Pi production-entry smoke lacked a post-shutdown permission with `requestStatus=not-submitted`. Earlier block-result and missing-credentials assertions passed. Its subsequent no-request assertion was not reached. This was not evidence of a released call.
- Other Bun failures were a projected dropped count of 0 instead of 1, background terminal unavailable instead of completed, a 30-second pinned dispatch timeout, an explicit checkpoint timeout with `serial=26 assessed=26 replies=0 executed=9 confirmations=17`, indexed invocation count 1 instead of 4, and 15 reads instead of 256 in the bounded-refresh case.

The old failed-run logs did not contain measured writer completion/health snapshots or persisted-versus-indexed counts. Load was observed but is not an established cause. The old Bun outer command was stopped at 300 seconds without a complete-suite summary; the resumed complete suites had no arbitrary outer cap and retained project individual test timeouts.

### Measured readiness evidence

A disposable offline diagnostic, `coverage/tenet22-validation/archive-readiness-probe.ts`, explicitly separates writer completion, health, record validation and index visibility. Final successful output is `archive-readiness-probe-4.log`:

| Case | Measured result |
| --- | --- |
| Normal older-session seed | Initial drain and close true; written 53, pending/failed/dropped/drainTimeouts 0; 53 valid stored records; API-equivalent first index page 50; indexing false; no reader/index issues |
| Injected blocked persistence, unchanged default close deadline | Close false; written 0, pending 1, drainTimeouts 1; no stored records |
| Same writer after releasing injected persistence | Drain true; valid begin plus writer-health record; pending/failed/dropped 0; retained drainTimeouts 1; one indexed invocation; no reader/index issues |
| Two proposed SDK calls with scripted offline transport | Both completed; close true; two request records and submitted permissions; zero health losses/pending/timeouts and reader/index issues |
| Missing credentials SDK call | Blocked, unavailable assessment; close true; zero requests; not-submitted permission recorded; zero health losses/pending/timeouts and reader/index issues |

This demonstrates the incomplete-readiness mechanism, not the cause of the historical run. Three earlier probe logs are retained: two exposed mistakes in the disposable probe's SDK API usage; the third used a direct judge without request recording. The corrected probe uses the documented session-ready API and scripted transport. None was a production or fixture defect. No production timeout, archive behavior, assertion or fixture was changed to obtain passing archive validation, and no unrelated scope expansion was needed.

## Single completion review and resolutions

Reviewer run: `df22f19f-2a62-4cc7-8301-00a63b0d367e`, fresh generic delegate, read-only working-tree review including untracked files against the original base. Original report is retained as `TENET-22-completion-review.md` in the fresh log directory and task attachment `01M3YS6EC22SK033M2A2XS2ZMV`. Its verdict was request changes with two P2 findings; it found no authorization bypass or change to evaluator questions/state/thresholds/gates.

### R1: divergent recorded-assessment validator

Extracted browser-safe `src/decision/assessment-shape.ts`, shared by runtime validation and recorded completeness. It validates complete unique rule identities, model, compatible profile, exact probability distributions, integrity restrictions and bounded applicability-reference shapes. Authentication/exemption support stays in runtime validation; gate calculations remain unchanged. The inspector does not authenticate recorded exemptions or reevaluate decisions.

Recorded failures/issues on assessment, validation, decision and lifecycle stages suppress the affirmative statement. Unprofiled historical records use the known legacy structural contract while retaining their historical display label; unknown profiles remain conservative.

Regressions cover forbidden references on non-applicability outcomes, malformed/bounded applicability references, incompatible profiles, issues/failures at each relevant stage, unprofiled legacy completeness and shared runtime/recorded rejection. Structural inspection preserves the input and cannot authenticate an exemption.

### R2: missing retained content gaps

History normalization now records its own fixed omission/redaction provenance in a private weak map and carries it across the final request copy. Final diagnostics use that provenance for retained events, including nested missing, image, circular and unsupported content. The map is absent from serialized evaluator state and archive payloads; the archive retains the bounded final diagnostic. Authored marker-shaped objects cannot invent runtime provenance. Excluded events do not contribute retained content gaps; whole-event counters remain unchanged.

Captured-request and compiled SDK on/off delivery regressions cover unavailable/image/nested content, identical owner result/report/archive values, authored marker non-promotion and unchanged submitted-state baselines. The oversized-observation baseline additionally asserts its diagnostic marker and zero whole-event omissions.

The test-first checkpoint `review-red.log` recorded 13 failing new assertions before implementation. `review-final-focused.log` records 99 passing tests across nine files after both fixes. The original reviewer was not relaunched; the implementer resolved the findings and reran affected checks.

## Final settled-code validation

All checks were serialized, offline, with injected judges, scripted transport and synthetic fixtures. No live evaluation/replay, saved fixture action dispatch, credential disclosure, dependency-version change, new service, external host change or unrelated process termination occurred.

| Command | Final result | Log in fresh directory |
| --- | --- | --- |
| `bun run sdk:build` | Pass; also rebuilt by final typecheck/example | `review-sdk-build.log`, `review-typecheck.log`, `review-sdk-example.log` |
| `bun run inspector:build` | Pass; also rebuilt by final browser command | `review-inspector-build.log`, `review-inspector-tests.log` |
| Focused structural/coverage/preparation/applicability tests | 99 pass, 0 fail | `review-final-focused.log` |
| `TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000` | 659 pass, 0 fail across 71 files, 223.73 seconds | `review-full-bun.log` |
| `bun run typecheck` | Pass | `review-typecheck.log` |
| `bun run inspector:check` | 0 errors, 0 warnings | `review-inspector-check.log` |
| `CI=1 bun run inspector:test` | 16 component and 25 browser tests pass | `review-inspector-tests.log` |
| Plugin `tsc --noEmit`, `CI=1 vitest run --config vitest.config.ts` | Pass, 18 tests | `review-plugin-check.log` |
| `bun run sdk:example` | Offline Node example pass | `review-sdk-example.log` |
| `git diff --check` | Pass | Checked directly |

The pre-review resume run also completed 631 Bun tests and the complete inspector gates. Those logs remain, but the post-fix results above are the final code-state gate. Only documentation changed after these checks.

Screenshots are local ignored artifacts in `coverage/inspector-artifacts/playwright/`, including `coverage-summary-mobile.png`, `coverage-mobile.png`, `desktop.png` and `mobile.png`. The summary screenshot was inspected for readability and no horizontal overflow. Logs and the disposable probe are ignored local artifacts, not implementation files. The task retains attached handoff/review evidence.

## Changed files

The implementation commit includes these 51 files. Generated build output, logs, screenshots and the disposable probe are excluded.

```text
README.md
docs/action-resolution.md
docs/assessment-contract.md
docs/claude-code.md
docs/inspection-evidence.md
docs/sdk.md
docs/TENET-22-handoff.md
eval/applicability-comparison.ts
inspector/src/DecisionSummary.svelte
inspector/src/EvidenceCoverage.svelte
inspector/src/EvidenceDock.svelte
inspector/src/presentation.ts
inspector/tests/browser-fixture.ts
inspector/tests/debugger.vitest.ts
inspector/tests/integration/archive.vitest.ts
src/claude/bridge.ts
src/decision/assessment-contract.ts
src/decision/assessment-shape.ts
src/decision/contracts.ts
src/decision/decide.ts
src/decision/evidence.ts
src/decision/evidence-context-contract.ts
src/decision/evidence-context.ts
src/decision/history-selection.ts
src/decision/immutable.ts
src/decision/jev.ts
src/decision/judge-evidence.ts
src/inspector/archive-index.ts
src/inspector/assessment-completeness.ts
src/inspector/bb-findings.ts
src/inspector/view.ts
src/pi/owner-reports.ts
src/pi/report-history.ts
src/recording/archive.ts
src/recording/contract.ts
src/runtime/consequences.ts
src/runtime/guard.ts
src/runtime/owner-record.ts
src/sdk/index.ts
src/sdk/types.ts
test/assessment-shape.test.ts
test/cross-host-recording.test.ts
test/evidence-context-delivery.test.ts
test/evidence-context-recording.test.ts
test/evidence-context.test.ts
test/evidence-preparation.test.ts
test/inspector-presentation.test.ts
test/legacy-recording-fixture.ts
test/recording.test.ts
test/sdk-assessment-types.fixture.ts
test/triage-index.test.ts
```

## Remaining limits and parent handoff

Offline tests establish mechanical reporting and enforcement equivalence, not live evaluator semantic accuracy or deployed host certification. Stock action resolution stays unsupported; stock Claude lacks a trusted live owner UI. Missing execution stays unknown, and historical records without diagnostics stay not recorded. Free-text limitations/evidence can contain secrets under the existing privacy model.

There are no remaining known blocking review findings or validation failures. The parent should integrate the reported local commit using its normal workflow, then decide when dependent tasks can resume. This child has not pushed, opened a PR, merged or changed parent/dependency worktrees or task statuses.
