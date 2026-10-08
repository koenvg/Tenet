# Inspector tests

Use this developer-checkout guide to test the local inspector UI without evaluator calls or a signed-in browser. The supported suites use disposable headless Chromium. Neither connects to Arc, needs a CDP endpoint, uses a signed-in profile, or calls the evaluator.

## Set up and run both suites

Use Node 22.19+ for the Pi-backed fixtures and Bun 1.3.14+. SDK-only consumers have a lower Node 22.12+ minimum; that is not the full inspector-test requirement. CI uses Node 22 and Bun 1.3.14.

1. From the repository root, install locked dependencies and Chromium:

   ```sh
   bun install --frozen-lockfile
   npm ci --prefix bb-plugin-tenet-status
   bunx playwright install chromium
   ```

   On Linux CI, use `bunx playwright install --with-deps chromium` for browser system libraries. Installation can download packages; the suites do not make external requests.

2. Open the [isolated validation shell](../../CONTRIBUTING.md#check-a-change), then build the SDK and shared library. Pi-backed fixtures import the SDK; BB preview tests import the generated shared summary.

   ```sh
   bun run sdk:build
   bun run summary:build
   ```

3. Run static checks, then both UI suites:

   ```sh
   bun run typecheck
   bun run inspector:check
   CI=1 bun run inspector:test
   ```

The test command runs the component suite, builds the client, then runs the built-app suite. Success means the checks exit zero and Vitest reports passing tests. See [the full offline validation order](../../CONTRIBUTING.md#check-a-change) for application, BB plugin, and delivery checks. These tests do not establish live provider connectivity or active owner hooks.

## Component suite

To run only components, complete setup above, then run from the repository root:

```sh
CI=1 bun run inspector:test:components
```

Vitest Browser Mode mounts React components in headless Chromium without a production build. Browser-safe view fixtures and mocked same-origin API responses cover:

- Decisions, inert recorded Markdown, question formatting, and evidence navigation.
- Resizing, initial selection, deep links, and loading/error/recovery states.
- Shared summary hierarchy, check-selection focus, inert rule text and narrow Calls/Summary navigation at a 390px viewport and a 390px container inside a wide window.
- Summary projection and rendered output exclude sentinel action arguments, submitted evidence, exact questions, provider bodies, raw policy and recording paths. The library mount updates and disposes without transport or shell-style changes.

The API mock rejects unexpected or non-local requests. This suite does not check archive security.

## Built-app suite

To run only the built app, complete setup and SDK build above, then run from the repository root:

```sh
CI=1 bun run inspector:test:browser
```

This command builds the client first. Node Vitest starts a temporary loopback inspector with that production build and launches disposable headless Playwright Chromium. Synthetic archives, real local HTTP, and independent browser contexts cover desktop/mobile layout, keyboard and pointer controls, and recorded assessment detail.

Integration tests cover live session discovery, delayed execution, selected-session warning scoping, reconnecting polls, project filtering, cursor pagination, deep links beyond the first page, waiting sessions, corrupt/interrupted capture, and recovery after server errors. Here, live session discovery means local capture, not live provider evaluation. Each case cleans up its archive, server, and context. Tests block and check non-local browser requests. They make no production evaluator request.

### Wait for fixture capture

1. For static seeds, use `FixtureArchiveWriter.settle()` between batches and `complete()` before starting a reader. These test-only methods follow write-completion notifications. They require zero failures, drops, pending stages, and drain timeouts. They do not retry drains or change production shutdown bounds.
2. For Pi-generated fixtures, use `guardHarness.shutdownCaptured()`. It waits for clean current capture, shuts down once, and requires the existing terminal owner status to report zero loss and a completed drain. Shutdown can enqueue additional execution stages. Keep raw `emit('session_shutdown')` for deliberate failure tests.
3. For a valid invocation deep link, wait for `withInspector.open()` to render invocation detail. A document `load` event does not finish archive selection. Put semantic assertions after that boundary; do not extend their poll deadlines to cover setup.

## Separate call-fact regressions

`test/inspector-presentation.test.ts` retains the execution/permission matrix and historical contract cases. `test/inspector-call-facts.test.ts` checks named facts, future/unknown values, invalid completed assessments and strict shared-context requirements. Assessment, approval and scores cannot establish execution.

`bb-plugin-tenet-status/paginated-summary-parity.test.ts` writes valid schema-3/4 historical archives and current schema-5 production records with 16 user rules plus integrity. Public HOST reads and React-rendered summaries keep integrity violations, uncertainty and multiple-blocker explanations unchanged from first page to second page and back. Inspection still returns at most 16 rules per page; strict explanation schemas reject extra fields and raw sentinels.

Component tests check the named Tenet permission, Tool result and Assessment fields. The list shares ordinary context only for displayed calls that establish it. `components/context.vitest.ts` changes filters, loads another page and adds a late result without replacing selected detail. Independent violation, uncertainty and approval findings stay visible. Lifecycle status is not repeated as summary badges.

`integration/status.vitest.ts` retains desktop and 390px checks, historical schemas 1 through 4, exact evidence, scores, thresholds, questions, actual observe-mode blocks and permission/result contradictions. Delayed assessment and result stages preserve the invocation link, mounted exact-data regions, Recorded data disclosures, evidence DOM node and scroll position.

`integration/call-facts.vitest.ts` serves an authored fictional archive through the built app. It checks pending, dropped, cancelled, incomplete, unavailable and invalid assessments, successful and failed results, observe ASK, separate approval and all overlapping findings. `integration/summary-preview.vitest.ts` captures the minimal desktop/mobile first view. Existing archive checks retain direct filters, the public group API, deep links and partial-coverage indicators and issue disclosures.

These are recorded-data presentation tests, not live accuracy measurements. Fixture actions never execute. No result is inferred from released permission or approval. A failed result does not prove there were no external effects.

Verification rewrites no archive or policy and restarts no active service. Owners must rebuild and restart the inspector to load changed assets; rebuilding alone leaves a running reader unchanged.

Rollback needs a separately preserved, verified previous installation and its build. Do not reset a shared working tree. Preserve recordings and unrelated local changes; see [archive rollback prerequisites](../../docs/INSTALL-ARCHIVE.md#removal-and-rollback).

## Call workspace and direct category filtering

The selected call replaces the desktop Summary/group switch. On narrow screens, Calls and Selected call remain.

The native Finding category select is directly visible in Calls, without an accordion, and retains its label, keyboard access, counts, overlap guidance, active category and Clear filter. There is no Repeated uncertainty UI, replacement group view or group fetching by the UI.

Session / archive holds project/session selection, More sessions, manual refresh, read-only explanation and healthy reader metadata. More invocations stays below all loaded calls.

`components/navigation.vitest.ts` checks command/path-first rows, the direct select, active filters, both pagination controls and empty selection. It checks healthy, unknown, indexing and capture-only archive states, plus mobile access to exact reader/file/writer details and restart guidance.

`integration/navigation.vitest.ts` checks desktop, 1380px/460px sidebar and mobile states, native controls, genuine zero-match reset, individual hashed call links, history and no UI group requests. Unchanged polls retain selected detail and Recording issues disclosures, focus, scroll and private URLs. Existing archive/history, resizing, status and delayed-stage cases remain.

`integration/complete-flow.vitest.ts` checks the assembled 390px route with native keyboard input. It reaches the last compact rule, scrolls exact records to the end, retains focus/scroll across a real poll, selects a true zero-match category by type-ahead, resets the filter and scrolls Recording issues. A complete fictional call and a later partial archive are separate states.

Direct API and Bun regressions preserve group identities, counters, references, bounds and overflow without a group view.

`test/inspector-group-display.test.ts` checks the 512 UTF-8 byte excerpts, supported 16-rule bound, separate identities, unavailable previews, cache invalidation, unchanged-evidence reads, accurate group/reference overflow and private API projections. `test/inspector-preview.test.ts` retains non-empty BB projection sentinels. Existing BB policy-text fields are unchanged; private display metadata is not added to them.

## Simplified first view

The first view shows the action, recorded mode, named permission/result/assessment, applicable findings and one brief recorded-data reason. Released permission displays as **Not blocked by Tenet**, with the raw archived `released` value unchanged. The sidebar keeps per-call exceptions and one concern cue; it compacts only proved displayed context.

A `+N` cue counts additional finding categories, not additional violated rules. All categories remain in the selected call and category filters are unchanged.

**Recorded data** replaces Evidence and Details with submitted action fields, captured policy, exact shared evidence, one **Exact rule records and captured questions** destination, SDK response/validation and recording/coverage. **Why this assessment** keeps compact recorded-rule text and confidence bars. Question shortcuts/readable questions, repeated PASS notes, separate outcome rows and technical rule panels are absent. Complete exact records stay in Recorded data.

`components/compact-rules.vitest.ts`, `detail.vitest.ts` and `presentation.vitest.ts` keep finding-first historical FAIL/approval priority, outcome, severity, integrity, gate, approval, WARN and missing/non-applicable cases. Compact readings show each precise score and threshold once, distinguish selected evidence from SUFFICIENT and flag only recorded confidence gates. Full exact records remain independent of raw response and retain all fields. Tests check removed controls stay absent, text stays inert, and rule/data/evidence nodes, focus, disclosures and scroll survive updates.

The common-only comparison checks identical safe DOM content/order and element positions at wide and 390px container widths. Selection, filters, check details and disclosures stay synchronized across adapters. A raw-extension toggle must not move or change common summary rows; provider failure and coverage facts remain visible.

Browser Back tests check selected-call association, action preview, submitted evidence and exact question access after standalone extension placement changes. These use synthetic archive HTTP and public controls at desktop and 390px viewport sizes.

Native disclosures and the exact-data region retain keyboard access. Text roles use the existing sans and monospace families, fixed rem sizes and readable body text. Desktop, narrow and enlarged-root-text checks cover wrapping, bounded records and 44px disclosure targets.

`integration/rule-explanations.vitest.ts` checks complete exact rule/question records despite a truncated response at 1103px and 390px. Real unchanged polls retain the data node, disclosure, focus, inner/outer scroll, exact values and invocation URL.

Native disclosures stay closed on a new selection and remain mounted through polls. Tests open public entry points before interaction. Superseded explanation, readable-question and meter assertions are replaced by exact-data, absence, keyboard and mounted-state checks; historical and status semantics remain covered.

Recorded data's Recording and coverage disclosure groups recorded outcomes, recording metadata and coverage. Keys and values align at desktop and narrow widths. Assessment facts stay separate from capture counters.

Record identifiers are bounded read-only fields. Coverage explanations and interpretation limits have named disclosures. Regressions check the groups, long identifier values and bounds at both widths.

`components/recorded-data.vitest.ts` checks full submitted edit strings, arbitrary/missing/malformed arguments, exact null values, shared state/history/reference pools, loss markers, policy identity, all rule questions/choices/mappings, precision, response truncation/unavailability, validation and approval. All rule and question JSON uses one named native disclosure, independent of raw response availability, not a format switch.

`integration/recorded-data-preview.vitest.ts` serves authored fictional edit/policy/question/response/loss cases. It captures desktop/mobile Recorded data and questions. Real polls test delayed request/result stages, lossless UTF-16 identities and stable exact-data nodes, evidence nodes, focus, open disclosures, scroll and unchanged URLs. Existing history, threshold, status and pagination tests use the new destinations without removing their semantic cases.

The Observe plus blocked-permission regression keeps the counterfactual assessment visible in the first view, without opening Recorded data. No archived fact is repaired or rejected.

The enclosing test deadlines still apply. The delayed schema-3 regression checks the deep-link ordering through real archive HTTP and rendered findings.

## Run archive and security checks separately

Build the SDK and inspector first, as shown in [the contributor checks](../../CONTRIBUTING.md#check-a-change). From the repository root, run:

```sh
bun test --isolate --max-concurrency=1 --timeout=30000
```

On Bun 1.3.14, plain all-file `bun test` can register `node:test` files inside another running test and time out long startup cases. The isolated serial run passes. Vitest files use `.vitest.ts` so Bun does not collect them. `bun run typecheck` and `bun run inspector:check` cover static checks.

## Chromium cannot start or a test fails

- Check the browser installation and Linux system libraries first.
- If Pi fixtures cannot import the SDK, run `bun run sdk:build` before retrying.
- For a test failure, inspect its unique directory under ignored `coverage/inspector-artifacts/playwright/`. It retains API response timing, browser errors, and HTML/screenshots for every open page, including linked pages. Synthetic summary screenshots also go there.
- Vitest Browser Mode may save failures under ignored `.vitest/attachments/`. A CI job can upload these directories on failure.

Tests never overwrite tracked `.impeccable/review/` reference images. The user-facing `/tenet-inspector` command still opens Arc; Arc is not a test dependency.
