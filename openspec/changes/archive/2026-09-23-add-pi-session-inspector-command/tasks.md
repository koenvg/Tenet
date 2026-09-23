## 1. Pi command and server lifetime

- [x] 1.1 Add focused command tests that fail until `/tenet-inspector` starts one server on demand, repeats reuse it, and no startup socket opens merely by loading the extension; verify with the Pi command harness and a real loopback listener.
- [x] 1.2 Register the command in the TENET extension with a session-owned lazy server controller using the configured recording directory and built frontend; verify the focused command tests pass with the production build.
- [x] 1.3 Add session shutdown, reload, replacement, resume, and in-flight-start race tests; implement idempotent listener cleanup and verify the old URL refuses connections afterward while independent reader/recording tests still pass.

## 2. Deep link and Arc opening

- [x] 2.1 Test that the displayed link uses the hash of the current Pi session ID, keeps cross-project browsing available, and selects a current session with no records without showing a different session; verify URL and UI tests against an offline archive.
- [x] 2.2 Show the session link in owner-visible Pi UI, request Arc with an argument-safe macOS launch, and warn without changing browsers on missing Arc, failed launch, or unsupported platform; verify injected-launcher tests confirm both the URL and fallback behavior, including repeated commands.
- [x] 2.3 Reject missing or invalid `inspector/dist` assets before opening Arc or retaining a listener, with a `bun run inspector:build` hint; verify failure-path tests and a successful production-asset HTTP response.

## 3. Documentation and integration checks

- [x] 3.1 Update README with `/tenet-inspector`, build prerequisite, session-lifetime shutdown, Arc auto-open plus printed-link fallback, local evidence access limits, and the independent CLI workflow; verify the documented commands and URL behavior match offline tests.
- [x] 3.2 Run focused command, server, and UI tests, Pi smoke tests, the full Bun suite, typecheck, Svelte check, and frontend build; record failures or skipped checks. In the owner's existing Arc session, verify a live and an empty-session link plus cross-project navigation, or report an Arc connection blocker without switching browsers.
