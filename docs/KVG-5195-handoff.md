# KVG-5195 handoff

## Scope

Changed the default inspector command to run the Svelte client through Vite for live reloading while retaining the standalone production launch path. Ran `bun i` before implementation; dependencies installed successfully and `bun.lock` did not change.

## Behavior

- `bun inspector` starts the archive API on loopback, starts Vite on loopback, proxies `/api` to the archive server and prints the browser URL. Vite injects its HMR client, so edits under `inspector/` reload during development.
- `bun run inspector:serve` serves the built `inspector/dist` assets from the standalone read-only backend.
- Startup failures close any server already opened, and normal shutdown closes both the Vite and archive servers.
- README launch instructions now distinguish development and production commands. OpenSpec task 4.1 is complete.

## Verification

- `bun test`: 197 passed, zero failed.
- `bun run smoke`: passed.
- `bun run typecheck`: passed.
- `bun run inspector:check`: zero errors and warnings.
- `bun run inspector:test`: production build and both UI fixtures passed.
- `bun inspector` manual process check: served an HTML page containing `/@vite/client`; proxied `/api/sessions` returned HTTP 200.
- `git diff --check`: passed.
- `bunx openspec validate add-standalone-decision-inspector --strict`: passed.
