# Inspector tests

`bun run inspector:test` builds the client and runs offline DOM/HTTP tests. It needs no browser or evaluator credentials.

## Vitest + Playwright in Arc

1. Use Node 22.12+ or Node 24. Install dependencies with `bun install`.
2. Connect the owner's Arc with remote debugging available at `http://127.0.0.1:9222`.
3. Run `bun run inspector:test:browser`.

Set `TENET_BROWSER_CDP_URL` if Arc uses a different CDP endpoint. A connection failure fails the suite; it never downloads or launches another browser. Vitest runs in Node and drives the existing Arc through `playwright-core`, rather than launching a Vitest Browser Mode provider.

When the owner explicitly authorizes a separate Chrome debugging instance, run the same suite against its loopback endpoint, for example `TENET_BROWSER_CDP_URL=http://127.0.0.1:9223 bun run inspector:test:browser`. Use a temporary profile. The suite connects to that instance; it never launches a browser itself.

The suite builds the production client, creates an offline synthetic archive, and starts an ephemeral loopback inspector. Each test creates and closes its own tab in Arc's existing context. Other tabs and the signed-in profile are left in place. Non-local page requests are blocked and checked; no evaluator calls are made.

Coverage:
- Explorer pointer dragging and keyboard resizing, bounds and persistence across calls.
- Visual action, policy decision and actual execution sequence. Evidence, probability tables and other rules start collapsed.
- Exact confidence values and thresholds. A low-confidence PASS remains distinct from a violation.
- Rich Markdown instructions, answer choices, exact JSON toggling and inert hostile content.
- Evidence scroll preservation and keyboard-accessible dock navigation.
- Mobile Calls and Summary navigation, evidence focus, hidden splitters and horizontal overflow at 320, 390 and 768 pixels.
- Missing captures and refresh failure/recovery.

Summary screenshots go to `.impeccable/review/desktop.png`, `mobile.png` and `user-2233.png`. They use a synthetic offline fixture reproducing a low-evidence-confidence decision in observe mode, not a real session. Failed-test captures go to `.impeccable/review/playwright/`. The archive is removed and the inspector stopped after the suite. Tests use the `.vitest.ts` suffix so `bun test` does not collect them.

The offline DOM suite also covers fresh-visit latest-call selection, direct links, stable selection during live updates, project filtering and pagination.

Both suites include an archive-wide temporary-file warning outside the selected session. Unchanged background polls must not mutate the page or briefly show that warning in the selected session. Genuine selected-session recording issues remain visible.
