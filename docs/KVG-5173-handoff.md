# KVG-5173 standalone workflow handoff

## Delivered

- Expanded `README.md` with production prerequisites, asset layout, startup/shutdown, storage override and the closed-reader to resumed-session workflow. Corrected production port guidance to match the OS-selected port.
- Retained explicit warnings for default-on sensitive persistence, imperfect field redaction, unencrypted owner-only storage, same-owner access, no authentication, capture opt-out, no expiry and manual deletion only after all writers and the inspector stop.
- Added `test/standalone-workflow.test.ts`. It uses the real guard lifecycle, scripted SDK transport and standalone HTTP API. No inspector runs during initial pass, concern and provider-failure recording. A reader restart preserves exact historical evidence and all rule questions. Same-session resumption adds a call and live permission/execution stages without changing old detail. It also checks canonical project filtering, rejected mutations and exclusion of evidence/secrets from safe Pi records.
- No runtime or UI implementation changed.

## Verification

Run with Bun 1.3.14 on macOS:

| Check | Result |
| --- | --- |
| `bun i` | Passed; no lockfile diff |
| `bun test` | 228 passed, zero failed |
| `bun run smoke` | 3 passed |
| `bun run typecheck` | Passed |
| `bun run inspector:check` | Zero errors and warnings |
| `bun run inspector:test` | Production build and both DOM workflow groups passed |
| `bun run inspector:test:browser` | Blocked by Arc CDP connection timeout before browser tests ran |
| `git diff --check` | Passed |

Also launched the documented `bun run inspector:serve` command against a temporary archive with `TYPESAFE_API_KEY` removed. HTML, built JavaScript and the session API loaded successfully without starting Pi. SIGTERM stopped the reader. Temporary storage was removed after shutdown.

The first integrated test run exposed a fixture expectation error: macOS canonicalizes `/var` to `/private/var`. The project-filter assertion now uses `realpath`, matching the documented archive identity.

## Security boundaries checked

The server imports the archive index and presentation code, not Pi or an evaluator. Its router permits only GET for bounded session/invocation routes and built assets. It has no approval, retry, mutation or provider operation. Existing route tests and the new integrated test verify rejected methods; existing failure-isolation tests compare capture on/off/failing across observe/enforce modes, decisions, approvals, permissions and executor counts.

The passing smoke tests cover owner findings excluded from model context and stdout. Recording tests cover transport credentials, provider error bodies, archive evidence and health reports excluded from safe reporting and evaluator history. The archive intentionally retains submitted evidence, which may contain sensitive strings. This is not a claim that arbitrary secrets are redacted, or that Pi transcripts and other extensions cannot log data.

## Arc blocker and remaining limits

`lsof` identified `/Applications/Arc.app/Contents/MacOS/Arc --remote-debugging-port=9222` as the listener. `/json/version` responded. Playwright established the debugging WebSocket but `connectOverCDP` did not finish within 5 seconds. The browser suite failed in setup. No other browser was launched and no visual verification is claimed.

The owner must restore a responsive Arc debugging connection, then rerun `bun run inspector:test:browser` and visually inspect historical and live synthetic sessions, rule selection and hostile evidence. DOM tests cover those behaviors but do not establish visual usability.

All assessments used scripted offline responses. These results establish integration mechanics, not live semantic accuracy, provider quality or a tamper-resistant security boundary. Capture remains best-effort. Missing lifecycle stages do not prove success. This ticket remains visually blocked until Arc verification completes; the parent OpenSpec change is not archived.
