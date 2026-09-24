# Design

## Context

See proposal.md for motivation. `inspector/tests/ui.mjs` is one 347-line JSDOM script that evaluates the built client against a loopback server and synthetic archives. `inspector/tests/debugger.vitest.ts` is an 11-test Vitest Node suite that connects Playwright to an existing Arc CDP endpoint. The former uniquely covers live archive discovery, delayed lifecycle stages, pagination, deep links beyond the first page, and capture-failure history; the latter covers real layout, pointer input, keyboard focus, CSS, mobile widths, and screenshots. Bun tests under `test/` cover server, index, process, and recording contracts. There is no repository CI workflow yet. Existing Vitest is 5.0.1, Svelte is 5.57.1, and Vite is 7.3.6.

## Goals / Non-Goals

**Goals:** Make the inspector's UI suites runnable locally and in a later CI job with an installed, disposable headless Chromium; preserve each existing behavioral assertion or replace it with an equivalent stronger browser check; keep isolated component feedback separate from built-app integration checks.

**Non-Goals:** Change the inspector's archive or decision behavior, the Pi command that opens Arc for its owner, archive/API contracts, evaluator calls, or add a CI provider/workflow in this change. Do not require the owner's signed-in profile or a CDP endpoint for tests. The owner approved one responsive header spacing correction when headless Chromium exposed 8px overflow at 768px; keep the existing no-overflow assertion.

## Decisions

### Separate component and full-app browser runs

Add a Vitest Browser Mode config using the Svelte Vite plugin, `@vitest/browser-playwright` matched to Vitest 5.0.1, `vitest-browser-svelte`, and a Chromium instance with `headless: true`. Render `SafeMarkdown`, `Detail`, `PaneResizer`, and `App` directly in browser tests, importing inspector CSS where layout matters. Keep component tests browser-safe: use representative serializable view fixtures and controlled same-origin API responses for `App` rather than importing Node filesystem or archive writers into the browser. Reset DOM, mocked requests, history, viewport, and timers between cases. Assert behavior through roles and user actions; use DOM/CSS geometry only where layout is the contract.

Keep a separate Node-environment Vitest suite for the production build served from a temporary loopback inspector. Its tests need Node filesystem setup and direct Playwright control, so they are not component tests. Change `connectOverCDP` to Playwright's bundled Chromium launch and create a fresh context and page per test. Keep the synthetic archive and block non-local requests. Close contexts, browser, server, and temporary archive even on failure. Use separate configs or strictly disjoint includes so Bun never collects browser-specific `.vitest.ts` files and the Node suite never runs in Browser Mode. Alternative considered: move every test into Browser Mode. That would push Node server orchestration into browser commands or cross-origin mocks and lose the simple built-client check.

### Port coverage before deleting JSDOM

Map the JSDOM script's checks to named browser cases. Use component tests for isolated rendering and interactions, including unsafe Markdown remaining inert, rule and evidence navigation, failed/missing data, keyboard controls, and controlled API errors. Use the full-app suite for cases that depend on persisted archive writes, real HTTP, polling across server updates, cursor pagination, deep links (including an older session omitted from page one), issue scoping, and recovery after server failures. Preserve fresh-visit selection, history navigation, selected-rule and scroll stability, and the absence of transient archive-wide warnings in the selected session. Remove `ui.mjs` only after those cases pass in a real browser. Keep the existing Bun server/security tests for Host/Origin checks, method rejection, filesystem bounds, and read-only access; browser component mocks are not security evidence.

### Install and report without owner state

Pin compatible `playwright` and Vitest browser packages as dev dependencies and document `bun install` plus `bunx playwright install chromium` (and host dependencies on Linux CI) before running tests. Run the component suite without a production build and the full-app suite after `inspector:build`; provide one documented inspector command that runs both, alongside `bun test`, `inspector:check`, and typecheck. Remove `TENET_BROWSER_CDP_URL` and Arc connection instructions from testing docs. Keep diagnostic screenshots in an ignored test-artifact directory rather than overwriting the tracked `.impeccable/review` reference images; a future CI job can upload them on failure. Alternative considered: retain the Arc-connected path as a fallback. That preserves an owner-specific failure mode and would leave the main test command unusable in CI.

## Risks / Trade-offs

- Browser package version or install drift -> Pin the provider to the installed Vitest version, verify the Svelte renderer's peer compatibility, document the Chromium install, and test a clean install.
- Browser tests are slower than JSDOM and polling is timing-sensitive -> Split component and integration suites, await observable states, bound waits, and avoid accelerated production polling timers or blind sleeps.
- Mocked API tests can pass while server integration fails -> Keep persisted archive/HTTP tests and port unique JSDOM integration cases before removal.
- Headless layout may differ from Arc -> Use deterministic Chromium viewport and reduced-motion settings for automated checks; keep manual owner visual review separate from CI assertions.
- CI screenshots could dirty tracked review images or expose synthetic evidence -> Write only offline-fixture captures to ignored artifacts and check the worktree after tests.

## Migration Plan

1. Add the browser testing dependencies, isolated configs, a runnable component smoke test, and documented Chromium installation. Confirm Browser Mode and the Node suite both run headlessly without CDP.
2. Port presentation and interaction coverage into Svelte component cases, then move the JSDOM-only archive workflows into the built-app suite with distinct fixtures and teardown.
3. Run both new suites and the old JSDOM script side by side. Compare coverage, then remove the script, unused dependencies, and Arc-only test configuration; keep production Arc launch unchanged.
4. Verify full Bun tests, Pi smoke tests, TypeScript and Svelte checks, production build, both browser suites, and a clean worktree apart from intended files. Document clean-machine/CI commands. Roll back by restoring the old test commands and script if coverage or browser installation proves unreliable; no archive or product data migration is needed.
