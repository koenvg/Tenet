# Tasks

## 1. Headless component test foundation

- [x] 1.1 Pin `@vitest/browser-playwright` to the installed Vitest version, add compatible `vitest-browser-svelte` and `playwright` dev dependencies, update `bun.lock`, and verify `bun install --frozen-lockfile` and package peer compatibility.
- [x] 1.2 Add an isolated Svelte-enabled Vitest Browser Mode config with headless Chromium and a component smoke test using the `.vitest.ts` suffix; verify it runs without a production build or Arc and that `bun test` does not collect it.
- [x] 1.3 Document local and Linux CI Chromium installation and the component command in `inspector/tests/README.md`; verify the documented command runs with `CI=1` and no CDP endpoint.

## 2. Port isolated Svelte behavior

- [x] 2.1 Add browser-safe synthetic view fixtures and component tests for `SafeMarkdown` and decision presentation, including inert hostile HTML, missing data, low-confidence PASS, UNKNOWN, approval, and separate execution labels; verify the Browser Mode suite passes without evaluator credentials.
- [x] 2.2 Add `Detail`, `EvidenceDock`, and `PaneResizer` tests for question JSON/Rich toggling, rule selection, evidence scroll and focus, keyboard tabs, and pointer/keyboard resize bounds; verify the Browser Mode suite passes at relevant desktop and mobile viewports.
- [x] 2.3 Add `App` component tests with controlled same-origin API responses for initial selection, navigation, loading, failure and recovery states; document the component-versus-full-app coverage split in `inspector/tests/README.md` and verify those cases pass independently of the archive server.

## 3. Keep built-app checks without Arc

- [x] 3.1 Replace `connectOverCDP` in `debugger.vitest.ts` with a disposable headless Playwright Chromium launch and per-test context/page cleanup; preserve local-only routing and move generated screenshots to ignored test artifacts. Verify all existing built-client tests pass without `TENET_BROWSER_CDP_URL`, Arc, or a signed-in profile. Keep the 768px no-overflow assertion with the owner-approved responsive header spacing fix.
- [x] 3.2 Port JSDOM-only real-archive cases for fresh visits, live session discovery, delayed execution, polling stability, selected-session warning scoping, reconnection, and retained selection/scroll into named built-app tests; verify the new tests pass against the loopback server after writes to the synthetic archive.
- [x] 3.3 Port JSDOM-only real-archive cases for project filtering, cursor pagination, history/deep links including an older session missing from the first picker page, empty sessions, corrupt/incomplete capture, and recovery after server failure; verify the built-app suite passes with distinct fixture cleanup for each case.
- [x] 3.4 Update `inspector/tests/README.md` with the headless full-app command, fixture boundaries, screenshot location, and coverage of the newly ported cases; verify the command works on a fresh browser install with no Arc connection.

## 4. Retire the old test path

- [x] 4.1 Compare the JSDOM script's assertions with the component and built-app cases, then delete `inspector/tests/ui.mjs` only after equivalent coverage passes; remove `jsdom` and any unused browser dependencies from `package.json` and `bun.lock` and verify `bun install --frozen-lockfile` succeeds.
- [x] 4.2 Update inspector scripts and README verification instructions so one inspector command runs both suites and none requires Arc or CDP; preserve the production `/tenet-inspector` Arc launch. Verify the documented clean-machine and `CI=1` commands work and tests do not modify tracked `.impeccable/review` images.

## 5. Integration verification

- [x] 5.1 Run `bun test`, `bun run smoke`, `bun run typecheck`, `bun run inspector:check`, production build, both headless inspector suites, and `openspec validate migrate-inspector-tests-to-browser-mode --strict`; record pass/fail and verify no test requires Arc, evaluator credentials, or tracked screenshot changes.

Validation on current `origin/main`: component suite 11/11 and built-app suite 20/20 with `TENET_BROWSER_CDP_URL` unset; isolated serial Bun run 312/312; smoke 4/4; typecheck, Svelte check, production build, strict OpenSpec validation and `git diff --check` pass. No tracked `.impeccable/review` image changed. Earlier raw `bun test` on the original base failed on Bun 1.3.14 (138 pass, 16 fail: 13 `node:test` nested registration errors and 3 default 5s timeouts); the documented isolated command passes. The single completion review's two test-boundary findings were fixed and their affected suites rerun.
