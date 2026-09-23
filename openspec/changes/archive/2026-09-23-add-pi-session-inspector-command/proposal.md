## Why

The inspector already records Pi decisions and serves them in a browser, but opening the current session requires a separate terminal command and manual navigation. A Pi slash command should make that inspection available when the owner needs it without changing how recording or enforcement works.

## What Changes

- Add `/tenet-inspector` to the TENET Pi extension. On first use in a Pi session, it starts the existing read-only inspector on loopback, prints a link selecting that session, and opens the same link in Arc.
- Reusing the command within that session reuses the server and reopens the session link. Pi closes its server on session shutdown, including session switch, fork, reload, and exit. A resumed session can launch a new server on demand.
- Keep the browser's cross-project navigation and the existing independent CLI launch. Browser launch failures leave the printed link usable and never open another browser.
- Document the required production frontend build and the command's behavior when assets or Arc are unavailable. No evaluator requests, policy changes, or browser approvals are added.

## Capabilities

### New Capabilities

- `pi-session-inspector-launch`: Start and manage a local inspector from a Pi slash command, selecting the active session while retaining the full archive browser.

### Modified Capabilities

None. The existing `decision-inspector` capability is defined in the still-active `add-standalone-decision-inspector` change, not in the main specs. This change depends on that implementation and does not replace or narrow its standalone behavior.

## Impact

- Pi extension command registration and session lifecycle, the existing inspector server and URL deep links, and README launch instructions.
- Focused command/lifecycle tests and browser-launch fallback tests. Reuse the current archive, built frontend, and loopback read-only routes; do not add a service or a provider dependency.
