# Inspector tests

Use this developer-checkout guide to test the local inspector UI without evaluator calls or a signed-in browser. The supported suites use disposable headless Chromium. Neither connects to Arc, needs a CDP endpoint, uses a signed-in profile, or calls the evaluator.

## Set up and run both suites

Use Node 22.19+ for the Pi-backed fixtures and Bun 1.3.14+. SDK-only consumers have a lower Node 22.12+ minimum; that is not the full inspector-test requirement. CI uses Node 22 and Bun 1.3.14.

1. From the repository root, install locked dependencies and Chromium:

   ```sh
   bun install --frozen-lockfile
   bunx playwright install chromium
   ```

   On Linux CI, use `bunx playwright install --with-deps chromium` for browser system libraries. Installation can download packages; the suites do not make external requests.

2. Build the SDK before Pi-backed browser fixtures import it:

   ```sh
   bun run sdk:build
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

## Execution-first status regressions

`test/inspector-presentation.test.ts` covers the execution/permission matrix, unknown and future values, neutral Ran and contradictions. Assessment, approval and scores cannot establish execution.

Component tests assert identical list/summary labels and tones for Ran, Failed, TENET blocked, Released and Execution unknown. They keep FAIL, uncertainty, approval, WARN and evaluator/lifecycle states separate. Missing assessments and nullable non-applicability evidence cannot invent scores or passing checks.

`integration/status.vitest.ts` uses authored inert stage records. Its initial regression failed before the change because the primary badge was Would block rather than Ran. It checks desktop and 390px previews, historical schemas 1 through 4, exact submitted evidence, recorded labels/probabilities/thresholds/questions, result/blocked-permission contradictions and missing-result precedence.

A pending Released call receives delayed assessment and execution stages through real archive polling on both layouts. The test checks Ran in both views without changing the invocation link, selected rule, Evidence tab, evidence DOM node or its scroll position. Existing archive tests retain category filters, uncertainty groups, deep links and partial-coverage warnings.

These are recorded-data presentation tests, not live semantic-accuracy measurements. Fixture actions never execute, and a failed tool result does not prove no external effects.

A Released fixture keeps execution unknown until an execution stage is recorded. ALLOW and approval do not prove dispatch. Blocked permission plus a result shows that result first, with an inconsistency notice that preserves both facts.

Verification rewrites no archive or policy and restarts no active service. Owners must rebuild and restart the inspector to load changed assets; rebuilding alone leaves a running reader unchanged. Rollback restores the previous code and rebuilds through the owner, preserving all archives.

## Simplified first view

The first view keeps call identity, recorded assessment status, actual execution, mode, findings and one brief reason visible. Both adapters use the same safe summary rows. The sidebar uses one actual-status chip, quiet mode text and one concern cue.

A `+N` cue counts additional finding categories, not additional violated rules. All categories remain in the selected call and category filters are unchanged.

**Why this assessment** opens the recorded map, selected check and all rules. The separate **Standalone-only inspection** section contains **Recorded action**, the **Evidence** tabbed dock and **Details** for exact lifecycle, versions, coverage and validation diagnostics.

Native disclosures stay closed on a new selection and remain mounted through polls. Tests open these public entry points before interaction; no old regression was skipped. New desktop/narrow tests check the simpler default and keyboard disclosure path.

The common-only comparison checks identical safe DOM content/order and element positions at wide and 390px container widths. Selection, filters, check details and disclosures stay synchronized across adapters. A raw-extension toggle must not move or change common summary rows; provider failure and coverage facts remain visible.

Browser Back tests check selected-call association, action preview, submitted evidence and exact question access after standalone extension placement changes. These use synthetic archive HTTP and public controls at desktop and 390px viewport sizes.

Expanded Details groups recorded outcomes, recording metadata and coverage. Keys and values align at desktop and narrow widths. Rule notes stay separate from capture counters.

Record identifiers are bounded read-only fields. Coverage explanations and interpretation limits have named disclosures. Regressions check the groups, long identifier values and bounds at both widths.

The Observe plus blocked-permission regression keeps the counterfactual assessment visible in the first view, without opening the map. No archived fact is repaired or rejected.

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
