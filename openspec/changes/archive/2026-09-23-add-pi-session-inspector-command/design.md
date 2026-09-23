## Context

See `proposal.md` for motivation and `specs/pi-session-inspector-launch/spec.md` for the behavior contract. `src/pi/extension.ts` currently registers only the guard; `/tenet` is a separate recent-findings menu. `src/inspector/server.ts` already serves a loopback-only read API and optional built assets, while `serve-cli.ts` starts it independently. The Svelte app accepts a `?session=<sha256>` deep link, but a session with no archive records needs a clear empty state. `recordingConfig()` supplies the same default or overridden archive directory used by the writer.

Pi 0.85.1 supports commands via `registerCommand` and closes session-scoped resources in `session_shutdown`, including `/new`, `/resume`, `/fork`, `/reload`, and exit. The standalone inspector change remains active, and its original token-auth design text conflicts with the later owner-approved token removal in the running code and README. This proposal follows the current implementation: no token, existing Host/Origin checks, no new security claim.

## Goals / Non-Goals

**Goals:**
- Start an inspector only when the owner invokes the slash command, reuse it within the active session, and release its listener on shutdown.
- Select the active session by a hashed ID, with no server-side filtering of other archive records.
- Make the URL visible in Pi and request Arc explicitly, without relying on default-browser settings.

**Non-Goals:**
- Embedding the frontend in Pi, replacing `/tenet`, launching Vite or building assets at command time, changing recording/enforcement, or keeping the Pi-owned server alive after session shutdown.
- Browser installation or automatic fallback to another browser. The standalone CLI continues to cover inspection when Pi is stopped.

## Decisions

### Keep the command in a small Pi adapter and reuse the existing server

Register `/tenet-inspector` from the existing extension entry point, with a session-owned controller that starts `startInspector` on first invocation. Resolve `inspector/dist` relative to the module, use the same `recordingConfig` path as the writer, and dynamically import the server from the command path. This preserves lazy startup and avoids a new daemon or a second HTTP router. The standalone server remains independent of Pi imports; Pi gains only an on-demand dependency on that server. Validate that the built frontend is present before reporting a link, and close any partly opened listener on failure. Tell the owner to run `bun run inspector:build` if assets are absent rather than silently starting an API-only server. Alternative: spawn `bun run inspector:serve` from Pi. That creates a child-process ownership and shutdown problem and makes locating the URL harder.

### Treat each Pi session runtime as the ownership boundary

Keep one start promise and server handle per extension instance. Concurrent invocations await the same start; repeated invocations reuse the URL. An idempotent `session_shutdown` handler awaits or cancels an in-flight start and closes the handle so a late start cannot leave a listener behind. Do not start the server during extension factory loading or `session_start`. A new runtime after resume, fork, or reload starts closed; a later command starts a new listener. Do not close an independently started CLI server or affect the archive writer. Alternative: a process-global server would survive session switches and contradict the requested session lifetime.

### Deep-link by archive key, not raw Pi session ID

Build the URL from the server's returned loopback origin and `sessionKey(ctx.sessionManager.getSessionId())`, using `URL.searchParams` to set `session`. The inspector's existing session picker and API remain cross-project. Keep that selection when no records exist yet; show an empty or waiting state until its normal polling discovers the first call. Avoid placing raw IDs, evidence, or project paths in the link. Alternative: add a session-filtering API, which would needlessly restrict the browser and duplicate the existing routing.

### Show the URL independently of Arc launch

Put the URL in an owner-visible Pi notification before trying to launch the browser. On macOS, invoke the OS `open` command with a fixed `-a Arc` and a separate URL argument, not through a shell or the default-browser handler. Bound the launch attempt and report a warning if Arc is missing or the launch fails. Do not launch Chrome, Safari, or an unsigned fallback; the visible URL remains usable. On platforms without Arc launch support, show the link and a warning. A successful launch request does not claim the page rendered or that Arc's debugging connection works.

## Risks / Trade-offs

- Local evidence is readable by other local processes under the current token-free server policy -> retain loopback binding, Host/Origin checks, read-only API and no-store responses; document this limit rather than implying browser isolation.
- Pi session shutdown during a slow start could leak a listener -> serialize start and shutdown, with a post-start shutdown check and idempotent close tests.
- Missing or stale built assets can make the link unusable -> fail visibly before launching Arc, with the build command in the error; production build stays explicit.
- Arc can accept the OS launch request yet fail to render -> print the URL regardless; treat end-to-end browser inspection as a separate check using the owner's Arc, not proof from the launcher return code.

## Migration Plan

No archive migration. Build the frontend once with `bun run inspector:build`, load or reload the updated TENET extension, and invoke `/tenet-inspector`. Existing `bun run inspector:serve`, dev mode, archive files, and `/tenet` keep their current behavior. Rollback removes the command adapter and leaves the standalone reader available.
