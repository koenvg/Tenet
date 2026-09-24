# Inspector session picker refresh fix

The two-second archive poll closed an open session picker even when the selected session had not changed. `App.svelte` bound the native `<details>` element to `open={!session}`; Svelte reapplied that value when the refreshed session list changed. The picker now binds `open` to its own state. Selecting a session closes it. Filtering or clearing a project filter keeps it open so a result can be chosen.

The offline UI test reproduces the original failure by leaving the picker open across multiple completed polls. It also checks discovery of a new session, search text and focus, and filter changes. The browser test covers native summary toggling but could not run: Arc's CDP WebSocket connects and then Playwright times out attaching.

Verification: `bun run inspector:test`, `bun run inspector:check`, `bun run typecheck`, `bun run smoke`, and `bun test --max-concurrency=1 --timeout=30000` passed. The default `bun test` run timed out under its five-second per-test limit, followed by Bun `node:test` nesting errors; the serialized run passed all 292 tests. Browser verification remains pending until Arc CDP attachment works.
