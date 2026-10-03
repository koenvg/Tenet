# Inspector tests

Use Node 22.12+ or 24 and Bun 1.3.14+. Install the locked dependencies and disposable Chromium before running UI tests:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
```

On Linux CI, install browser system libraries with `bunx playwright install --with-deps chromium`. Neither suite connects to Arc, needs a CDP endpoint, uses a signed-in profile, or calls the evaluator.

Run both suites with `CI=1 bun run inspector:test`. The command runs the component suite, builds the client, then runs the built-app suite.

## Component suite

```sh
CI=1 bun run inspector:test:components
```

Vitest Browser Mode mounts Svelte components in headless Chromium without a production build. Browser-safe view fixtures and mocked same-origin API responses cover decisions, inert recorded Markdown, question formatting, evidence navigation, resizing, initial selection, deep links, and loading/error/recovery states. The API mock rejects unexpected or non-local requests; these tests do not claim to check archive security.

## Built-app suite

```sh
CI=1 bun run inspector:test:browser
```

Node Vitest starts a temporary loopback inspector serving the production build and launches disposable headless Playwright Chromium. Synthetic archives, real local HTTP, and independent browser contexts cover layout at desktop/mobile widths, keyboard and pointer controls, and recorded assessment detail. Integration tests also exercise live session discovery, delayed execution, selected-session warning scoping, reconnecting polls, project filtering, cursor pagination, deep links beyond the first page, waiting sessions, corrupt/interrupted capture, and recovery after server errors. Each integration case cleans up its own archive, server, and context. Non-local browser requests are blocked and checked. No production evaluator request is made.

Static archive seeds use `FixtureArchiveWriter.settle()` between batches and `complete()` before starting a reader. These test-only methods follow write-completion notifications and require zero failures, drops, pending stages and drain timeouts. They do not retry drains or change the production writer's shutdown bounds. Pi-generated fixtures use `guardHarness.shutdownCaptured()` to wait for clean current capture, perform shutdown once, and require the existing terminal owner status to report zero loss and a completed drain. Shutdown can enqueue additional execution stages. Raw `emit('session_shutdown')` remains available for deliberate failure tests. The enclosing test deadlines still apply.

For a valid invocation deep link, `withInspector.open()` waits for rendered invocation detail after navigation. A document `load` event does not finish archive selection. Keep semantic assertions after that readiness boundary; do not extend their poll deadlines to cover setup. The delayed schema-3 regression checks this ordering through real archive HTTP and rendered findings.

Run Bun archive and security tests separately with `bun test --isolate --max-concurrency=1 --timeout=30000`. On Bun 1.3.14, the default all-file `bun test` can register `node:test` files inside another running test and time out long startup cases; the isolated serial run passes. These Vitest files use the `.vitest.ts` suffix so Bun does not collect them. `bun run typecheck` and `bun run inspector:check` cover static checks.

## Execution-first status regressions

`test/inspector-presentation.test.ts` covers the execution/permission matrix, unknown and future values, neutral Ran, contradictions and the rule that assessment, approval and scores cannot establish execution. Component tests assert identical list/summary labels and tones for Ran, Failed, TENET blocked, Released and Execution unknown. They keep FAIL, uncertainty, approval, WARN and evaluator/lifecycle states separate and verify that missing assessments and nullable non-applicability evidence do not invent scores or passing checks.

`integration/status.vitest.ts` uses authored inert stage records. Its initial regression failed before the change because the primary badge was Would block rather than Ran. It checks desktop and 390px previews, historical schemas 1 through 4, exact submitted evidence, recorded labels/probabilities/thresholds/questions, result/blocked-permission contradictions and missing-result precedence. A pending Released call receives delayed assessment and execution stages through real archive polling on both layouts. The test checks Ran in both views without changing the invocation link, selected rule, Evidence tab, evidence DOM node or its scroll position. Existing archive tests retain category filters, uncertainty groups, deep links and partial-coverage warnings.

These are recorded-data presentation tests, not live semantic-accuracy measurements. Fixture actions never execute. A failed tool result does not prove no external effects. A Released call has execution unknown until a result arrives; ALLOW and approval do not prove dispatch. Blocked permission plus a result shows the result first and a visible inconsistency notice while retaining both facts. No archive rewrite, policy reevaluation or active-service restart is part of this verification. Owners must rebuild and restart their inspector to load changed assets; rebuilding alone leaves a running reader unchanged. Rollback restores the previous code and rebuilds through the owner, preserving all archives.

Failure artifacts go in unique directories under ignored `coverage/inspector-artifacts/playwright/`, retaining API response timing, browser errors, and HTML/screenshots for every open page, including linked pages. Synthetic summary screenshots also go there; Vitest Browser Mode may also save failures under ignored `.vitest/attachments/`. A CI job can upload these directories on failure. Tests never overwrite the tracked `.impeccable/review/` reference images. The user-facing `/tenet-inspector` command still opens Arc; it is not a test dependency.
