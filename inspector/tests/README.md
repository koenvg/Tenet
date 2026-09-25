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

Run Bun archive and security tests separately with `bun test --isolate --max-concurrency=1 --timeout=30000`. On Bun 1.3.14, the default all-file `bun test` can register `node:test` files inside another running test and time out long startup cases; the isolated serial run passes. These Vitest files use the `.vitest.ts` suffix so Bun does not collect them. `bun run typecheck` and `bun run inspector:check` cover static checks.

Failure and synthetic summary screenshots go under ignored `coverage/inspector-artifacts/playwright/`; Vitest Browser Mode may also save failures under ignored `.vitest/attachments/`. A CI job can upload these directories on failure. Tests never overwrite the tracked `.impeccable/review/` reference images. The user-facing `/tenet-inspector` command still opens Arc; it is not a test dependency.
