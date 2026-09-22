# KVG-5216 inspector refresh flicker handoff

## Change

The inspector polls its archive every two seconds. The header's Refresh archive button used the polling flag for its disabled state, so its opacity changed on every background poll even when the archive was unchanged. Background polling now leaves the button alone. A manual refresh still disables it until that request finishes.

`inspector/tests/ui.mjs` observes the page through repeated unchanged polls and checks that no DOM mutations occur. The existing live-discovery and delayed-record tests still check that new archive data appears.

## Verification

- `bun i`: passed; no lockfile change.
- `bun run inspector:build && bun inspector/tests/ui.mjs`: passed. The new unchanged-poll assertion failed before the fix with repeated `BUTTON.disabled` mutations.
- `bun run inspector:check`: zero errors or warnings.
- `bun test`: 228 passed, zero failed.
- `bun run typecheck` and `bun run smoke`: passed.
- `git diff --check` and Impeccable detector: passed; detector returned no findings.
- `bun run inspector:test:browser`: blocked before tests. Arc's CDP WebSocket connected, but Playwright's `connectOverCDP` timed out after five seconds. No other browser was used. Browser visual confirmation remains open until Arc's debugging connection responds.
