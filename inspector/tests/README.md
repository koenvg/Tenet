# Inspector tests

Use this developer-checkout guide to test the local inspector UI without evaluator calls or a signed-in browser. The two browser lanes use disposable headless Chromium. Neither connects to Arc, needs a CDP endpoint, uses a signed-in profile, or calls the evaluator.

Use only synthetic archives and fixture actions. Never read or copy personal recordings or policy into fixtures, and keep `TYPESAFE_API_KEY` out of the validation environment. Screenshots and trace snapshots can expose exact displayed recording text.

## Set up and run all three lanes

Use Node 22.19+ for the Pi-backed fixtures and Bun 1.3.14+. SDK-only consumers have a lower Node 22.12+ minimum; that is not the full inspector-test requirement. CI uses Node 22 and Bun 1.4.3.

1. From the repository root, install locked dependencies and Chromium:

   ```sh
   bun install --frozen-lockfile
   bunx playwright install chromium
   ```

   On Linux CI, use `bunx playwright install --with-deps chromium` for browser system libraries. Installation can download packages; the suites do not make external requests.

2. Open the [isolated validation shell](../../CONTRIBUTING.md#run-focused-checks-in-a-clean-shell), then build the SDK and shared library. Pi-backed fixtures import the SDK; BB preview tests import the generated shared summary.

   ```sh
   bun run sdk:build
   bun run summary:build
   ```

3. Run static checks, then all three Inspector lanes:

   ```sh
   bun run typecheck
   bun run inspector:check
   CI=1 bun run inspector:test
   ```

The test command checks discovery, runs Node infrastructure tests, mounts components in Vitest Browser Mode, then builds and runs Playwright Test journeys. Success means every command exits zero and both runners report passing tests. See [the full offline validation order](../../CONTRIBUTING.md#check-a-change) for application, BB plugin, and delivery checks. These tests do not establish live provider connectivity or active owner hooks.

## Component suite

To run only components, complete setup above, then run from the repository root:

```sh
CI=1 bun run inspector:test:components
```

Vitest Browser Mode mounts React components in headless Chromium without a production build. Browser-safe view fixtures and mocked same-origin API responses cover:

- Native session selection, server-derived rule statuses, lazy action reads, deep links, and loading, error, and recovery states.
- Recorded action details, inert recorded Markdown, exact questions, and evidence navigation.
- Shared summary hierarchy, check-selection focus, inert rule text, and narrow Calls/Summary navigation at a 390px viewport and a 390px container inside a wide window. These are library and BB summary controls, not the standalone Inspector navigation.
- Shared summary projection and rendered output exclude sentinel action arguments, submitted evidence, exact questions, provider bodies, raw policy, and recording paths. The library mount updates and disposes without transport or shell-style changes. Standalone action disclosures separately expose exact recorded data.

The API mock rejects unexpected or non-local requests. This suite does not check archive security.

## Shared rule coverage

These tests cover the shared summary library and synthetic BB adapter. They do not exercise the standalone Session picker or Rule details dialog:

- `components/rules.vitest.ts` owns public-mount rendering across viewport and container widths. It covers 16-row and 3-row bounds, truncated and missing text, integrity selection and technical thresholds, and WARN call selection and rule detail. It also covers keyboard paging, inert text, overflow, and destruction.
- `integration/bb-rules.pw.ts` uses the real preview and adapter with the generated summary in one 390px panel inside a 1440px window. It owns rule paging and page-one reset after each call switch. It also covers provider failure, summary privacy, host isolation, keyboard navigation between Calls and Summary, close, and unmount.
- `integration/bb-panel.pw.ts` owns the responsive preview shell width variants.

The synthetic preview does not test a real BB host or native focus behavior. Real archive, HTTP, capture, and production-asset tests remain independent of these checks.

## Built-app suite

To run only the built app, complete setup and SDK build above, then run from the repository root:

```sh
CI=1 bun run inspector:test:journeys
```

This command builds the client first. Playwright Test starts a temporary loopback inspector with that production build and launches disposable headless Playwright Chromium. Synthetic archives, real local HTTP, and independent browser contexts cover desktop/mobile layout, keyboard and pointer controls, and recorded assessment detail.

`integration/bb-*.pw.ts` tests browser shells with simulated BB host reads. These synthetic Vite previews check shell routing, history, polling, disposal and host-style isolation. They do not prove native BB focus, persistence or deployed-host behavior.

Journeys run with one worker, no retries, 20-second test deadlines and 30-second setup/teardown allowances. Automatic traces, video, screenshots and HTML reports are disabled. Playwright discards automatic runner output, including raw error contexts, after each case.

Intentional screenshots use synthetic data. Shared diagnostics retain bounded, sanitized failure evidence outside the runner output directory.

Integration tests cover live session discovery, delayed execution, selected-session warning scoping, reconnecting polls, project filtering, cursor pagination, deep links beyond the first page, waiting sessions, corrupt/interrupted capture, and recovery after server errors. Here, live session discovery means local capture, not live provider evaluation. Each case cleans up its archive, server, and context. Tests block and check non-local browser requests. They make no production evaluator request.

### Wait for fixture capture

1. For static seeds, use `FixtureArchiveWriter.settle()` between batches and `complete()` before starting a reader. These test-only methods follow write-completion notifications. They require zero failures, drops, pending stages, and drain timeouts. They do not retry drains or change production shutdown bounds.
2. For Pi-generated fixtures, use `guardHarness.shutdownCaptured()`. It waits for clean current capture, shuts down once, and requires the existing terminal owner status to report zero loss and a completed drain. Shutdown can enqueue additional execution stages. Keep raw `emit('session_shutdown')` for deliberate failure tests.
3. For a valid invocation deep link, wait for `withInspector.open()` to render invocation detail. A document `load` event does not finish archive selection. Put semantic assertions after that boundary; do not extend their poll deadlines to cover setup.

## Run infrastructure and discovery checks

From the repository root inside the clean focused-check shell, run:

```sh
bun run inspector:test:node
bun run inspector:test:discovery
```

Node Vitest collects only `node/*.vitest.ts` and checks recording completion, trace privacy and deliberate Playwright failures through the journey fixtures. The child config selects `diagnostics/fixture.case.pw.ts` or `diagnostics/debugger.case.pw.ts` by target.

These isolated children cover real deadlines and interruption, debugger setup faults, browser guards before and after context closure, and shared-suite reuse. Neither is an ordinary journey.

The discovery guard uses runner collection commands. It requires positive, disjoint component, Node and journey file sets, two isolated children, no Bun collection and all three lanes in `inspector:test`. It reports file counts, not executed test counts. Both checks must exit zero. Infrastructure needs the SDK build from setup; its command builds inspector assets before running children.

## Separate call-fact regressions

`test/inspector-presentation.test.ts` retains the execution/permission matrix and historical contract cases. `test/inspector-call-facts.test.ts` checks named facts, future/unknown values, invalid completed assessments and strict shared-context requirements. Assessment, approval and scores cannot establish execution.

`bb-plugin-tenet-status/paginated-summary-parity.test.ts` writes valid schema-3/4 historical archives and current schema-5 production records with 16 user rules plus integrity. Public HOST reads and React-rendered summaries keep integrity violations, uncertainty and multiple-blocker explanations unchanged from first page to second page and back. Inspection still returns at most 16 rules per page; strict explanation schemas reject extra fields and raw sentinels.

Recorded-action component tests check the named Tenet permission, Tool result, and Assessment fields. `components/context.vitest.ts` mounts `PrivateCallExplorer` directly to check displayed-call context, category filters, pagination, and a late result without replacing selected detail. It does not exercise the standalone app navigation. Independent violation, uncertainty, and approval findings stay visible. Lifecycle status is not repeated as summary badges.

`integration/status.pw.ts` retains desktop and 390px checks, historical schemas 1 through 4, exact evidence, scores, thresholds, questions, actual observe-mode blocks and permission/result contradictions. Delayed assessment and result stages preserve the invocation link, mounted exact-data regions, Recorded data disclosures, evidence DOM node and scroll position.

`integration/call-facts.pw.ts` serves an authored fictional archive through the built app. It checks pending, dropped, cancelled, incomplete, unavailable and invalid assessments, successful and failed results, observe ASK, separate approval and all overlapping findings. `integration/summary-preview.pw.ts` captures the minimal desktop/mobile first view. Archive journeys check category filtering and groups through direct API reads, alongside deep links, partial-coverage indicators, and issue disclosures. These API checks do not imply standalone filter or group controls.

These are recorded-data presentation tests, not live accuracy measurements. Fixture actions never execute. No result is inferred from released permission or approval. A failed result does not prove there were no external effects.

Verification rewrites no archive or policy and restarts no active service. Owners must rebuild and restart the inspector to load changed assets; rebuilding alone leaves a running reader unchanged.

Rollback needs a separately preserved, verified previous installation and its build. Do not reset a shared working tree. Preserve recordings and unrelated local changes; see [checkout rollback prerequisites](../../docs/INSTALL.md#removal-and-rollback).

## Native session and rule navigation

The standalone Inspector opens on **Session** and **Rules in this session**, with no automatically selected action. Session opens a native popover with radio choices and More sessions. A rule row opens the native **Rule details** dialog, which shows full recorded wording, status, origin, and recorded checks. More rules and More recorded checks page their respective lists.

Each check has a **View recorded action** disclosure. Exact action data loads only when requested. Direct invocation links can instead open a **Recorded action** dialog without a rule association. On narrow screens, the rule dialog fills the width. There are no standalone Calls/Selected call tabs, Finding category select, call-list resizer, or More invocations control.

**Recording issues and archive controls** holds reader compatibility, file issues, writer-wide capture health, project filtering, and Refresh archive. More sessions belongs to the Session picker, not this disclosure. Capture counters are not per-call assessment facts, and zero counters do not prove complete capture.

Choose the tests by the behavior you need to verify:

- `components/fixed-rule-navigation.vitest.ts` checks explicit session selection, exact recorded identity across pages, duplicate and incomplete declarations, revision changes, cancellation and same-revision recovery after transient errors. `components/fixed-rule.vitest.ts` checks the separate minimal view, recorded wording, all four findings without success ticks, lazy tool fields and existing Inspector destinations.
- `integration/fixed-rule.pw.ts` checks the fixed view through production assets and synthetic archive HTTP at 1280px, 390px and 320px. It covers session history, insufficient-evidence FAIL remaining Unclear, 50-to-55 check pagination, keyboard disclosures, reduced motion, unchanged-poll focus and access to Inspector and Operations.
- `components/app.vitest.ts` checks the server-derived No violations found, Violation found, Unclear, and Not checked statuses. It also checks unknown inventory, unavailable exact wording, unchecked declarations, fresh visits without action reads, and exact rule/action deep-link associations.
- `components/session-rules.vitest.ts` checks opening a rule from its row SVG, inert full wording, lazy exact-action reads, and close/focus restoration.
- `components/navigation.vitest.ts` checks native session radios, picker closure and trigger focus, full-width panels at 390px and 320px, partial-archive diagnostics, restart guidance, and loading/error/empty-state recovery. It checks that the old call-list controls are absent.
- `integration/session-rules.pw.ts` checks all four session statuses through the real local server, pointer and keyboard selection, Escape, light dismissal, and focus restoration. Panel journeys run at 1280px, 390px, and 320px. They check 50-to-55 check pagination, lazy action disclosures, exact question data, independent panel scroll, and deep links. Polls retain focus and mounted data; close and Back/Forward restore panel state.
- `integration/navigation.pw.ts` checks rule-first navigation at 1380px, 1103px, and 390px. It checks exact mounted-data retention, focus, scroll, disclosures, hashed invocation links, history, manual refresh, and no UI group requests. Zero-match category filtering and group counts use direct API reads, not UI controls.
- `integration/complete-flow.pw.ts` checks the assembled 390px recorded-action route with native keyboard input. It reaches the last compact rule, scrolls exact records to the end, and retains focus and scroll across a real poll. A later partial archive checks the absence of category/call rows and keyboard scrolling of Recording issues. These are separate fictional states, not a category-filter journey.

The `integration/session-rules.pw.ts` visual-capture case writes synthetic screenshots only when `TENET_UI_CAPTURE_DIR` is set. The ordinary run does not verify those captures.

Direct API and Bun regressions preserve group identities, counters, references, bounds and overflow without a group view.

`test/inspector-group-display.test.ts` checks the 512 UTF-8 byte excerpts, supported 16-rule bound, separate identities, unavailable previews, cache invalidation, unchanged-evidence reads, accurate group/reference overflow and private API projections. `test/inspector-preview.test.ts` retains non-empty BB projection sentinels. Existing BB policy-text fields are unchanged; private display metadata is not added to them.

## Recorded action details

After you open a recorded action, its first view shows the action, recorded mode, named permission/result/assessment, applicable findings, and one brief recorded-data reason. Released permission displays as **Not blocked by Tenet**, with the raw archived `released` value unchanged.

`components/presentation.vitest.ts` also checks the private call-list concern cue. A `+N` cue counts additional finding categories, not additional violated rules. This does not describe a standalone sidebar.

**Recorded data** replaces Evidence and Details with submitted action fields, captured policy, exact shared evidence, one **Exact rule records and captured questions** destination, SDK response/validation and recording/coverage. **Why this assessment** keeps compact recorded-rule text and confidence bars. Question shortcuts/readable questions, repeated PASS notes, separate outcome rows and technical rule panels are absent. Complete exact records stay in Recorded data.

`components/compact-rules.vitest.ts`, `detail.vitest.ts` and `presentation.vitest.ts` keep finding-first historical FAIL/approval priority, outcome, severity, integrity, gate, approval, WARN and missing/non-applicable cases. Compact readings show each precise score and threshold once, distinguish selected evidence from SUFFICIENT and flag only recorded confidence gates. Full exact records remain independent of raw response and retain all fields. Tests check removed controls stay absent, text stays inert, and rule/data/evidence nodes, focus, disclosures and scroll survive updates.

`components/comparison.vitest.ts` mounts the shared summary adapters in a comparison preview, not the standalone app. It checks identical safe DOM content/order and element positions at wide and 390px container widths. Selection, filters, check details and disclosures stay synchronized across adapters. A raw-extension toggle must not move or change common summary rows; provider failure and coverage facts remain visible.

Browser Back tests check selected-call association, action preview, submitted evidence and exact question access after standalone extension placement changes. These use synthetic archive HTTP and public controls at desktop and 390px viewport sizes.

Native disclosures and the exact-data region retain keyboard access. Text roles use the existing sans and monospace families, fixed rem sizes and readable body text. Desktop, narrow and enlarged-root-text checks cover wrapping, bounded records and 44px disclosure targets.

`integration/rule-explanations.pw.ts` checks complete exact rule/question records despite a truncated response at 1103px and 390px. Real unchanged polls retain the data node, disclosure, focus, inner/outer scroll, exact values and invocation URL.

Native disclosures stay closed on a new selection and remain mounted through polls. Tests open public entry points before interaction. Superseded explanation, readable-question and meter assertions are replaced by exact-data, absence, keyboard and mounted-state checks; historical and status semantics remain covered.

Recorded data's Recording and coverage disclosure groups recorded outcomes, recording metadata and coverage. Keys and values align at desktop and narrow widths. Assessment facts stay separate from capture counters.

Record identifiers are bounded read-only fields. Coverage explanations and interpretation limits have named disclosures. Regressions check the groups, long identifier values and bounds at both widths.

`components/recorded-data.vitest.ts` checks full submitted edit strings, arbitrary/missing/malformed arguments, exact null values, shared state/history/reference pools, loss markers, policy identity, all rule questions/choices/mappings, precision, response truncation/unavailability, validation and approval. All rule and question JSON uses one named native disclosure, independent of raw response availability, not a format switch.

`integration/recorded-data-preview.pw.ts` serves authored fictional edit/policy/question/response/loss cases. It captures desktop/mobile Recorded data and questions. Real polls test delayed request/result stages, lossless UTF-16 identities and stable exact-data nodes, evidence nodes, focus, open disclosures, scroll and unchanged URLs. Existing history, threshold, status and pagination tests use the new destinations without removing their semantic cases.

The Observe plus blocked-permission regression keeps the counterfactual assessment visible in the first view, without opening Recorded data. No archived fact is repaired or rejected.

The enclosing test deadlines still apply. The delayed schema-3 regression checks the deep-link ordering through real archive HTTP and rendered findings.

## Run archive and security checks separately

Build the SDK and inspector first, as shown in [the contributor checks](../../CONTRIBUTING.md#check-a-change). From the repository root, run:

```sh
bun test --isolate --max-concurrency=1 --timeout=30000
```

On Bun 1.3.14, plain all-file `bun test` can register `node:test` files inside another running test and time out long startup cases. Use the isolated serial command for those cases. Vitest files use `.vitest.ts` and journeys use `.pw.ts` so Bun does not collect them. `bun run typecheck` and `bun run inspector:check` cover static checks.

## Chromium cannot start or a test fails

- Check the browser installation and Linux system libraries first.
- If Pi fixtures cannot import the SDK, run `bun run sdk:build` before retrying.
- For a `withInspector` fixture failure, inspect its unique directory under ignored `coverage/inspector-artifacts/playwright/failure-*/`. `report.json` records phase timestamps, request timings, console and page errors, browser state, server health, and cleanup results. Setup and navigation failures, callback failures, Playwright timeouts and interruptions, and teardown failures use the same capture path.
- Inspect the report's omissions before drawing conclusions. Diagnostics have time, event, string, page, and byte limits. A failure before browser setup can retain only a report. Available browser evidence includes up to three page screenshots and a bounded `trace.zip` with snapshots. Traces omit network entries, headers, cookies, and source files.
- Use only synthetic archives. Screenshots and trace snapshots can contain exact displayed recording text. Never point these tests at personal recordings or add credentials to fixtures. From the repository root, open an available trace with `bunx playwright show-trace <failure-directory>/trace.zip`. Replace `<failure-directory>` with the retained directory. Use the local viewer rather than uploading the trace to an external service.
- Vitest Browser Mode may save component failures under ignored `.vitest/attachments/`. On failure, the offline CI job uploads that directory and built-app `failure-*` directories for seven days. It does not upload temporary archives, owner homes, or all of `coverage/`.
- The Node lane runs deliberate failure subprocesses to check diagnostic retention and owned-resource cleanup. A deliberate 20-second timeout must fail in the subprocess and pass its enclosing regression. These checks add no retries or longer deadlines to existing browser cases.

Tests never overwrite tracked `.impeccable/review/` reference images. The user-facing `/tenet-inspector` command still opens Arc; Arc is not a test dependency.
