KVG-5168 implements the first assessment-to-inspector slice. See `docs/KVG-5168-handoff.md`. Unchecked tasks may have partial support; their broader behavior and verification remain in the parent change.

## 1. Recording contracts and persistent archive

- [x] 1.1 Define versioned recording stages, invocation/session identities and completeness states; verify contract tests cover absent requests, partial lifecycles and unsupported schema versions.
- [x] 1.2 Add separately parsed default-on recording config with archive path override and opt-out; verify invalid recording settings do not invalidate enforcement configuration and disabled capture writes nothing.
- [x] 1.3 Implement owner-restricted immutable stage files, hashed session directories and unique writer/event IDs; verify persistence across reopen, same-session resume, fork separation and concurrent-writer tests.
- [ ] 1.4 Implement bounded asynchronous queue, atomic writes, graceful shutdown drain and capture-health counters; verify injected disk errors, queue overflow and partial writes leave valid records readable without throwing into callers.
- [x] 1.5 Implement schema-validating archive reads with size limits and root/symlink containment; verify corrupt/unsupported records are surfaced individually and malicious session IDs cannot escape the archive.

## 2. Exact evaluator and lifecycle capture

- [x] 2.1 Capture the single immutable application payload at the `jev.ts` submission boundary with question mapping and policy/config metadata; verify scripted SDK fetch observes the same questions, choices and state as the archive, including redactions and omitted history.
- [x] 2.2 Capture SDK-returned responses, validation results and safe failure categories with bounded invalid-response snapshots; verify valid distributions, malformed responses, truncation, timeout and missing-credential cases without transport headers or API config credentials.
- [x] 2.3 Bind recording sinks to unique guard invocations and emit decision, approval, permission and execution stages for passes and concerns; verify concurrent calls, session switches, resumes and missing tool results remain correctly correlated.
- [ ] 2.4 Add owner-only recording location/health indicators while keeping existing safe session records unchanged; verify Pi integration tests exclude archive content and health reports from agent context and recovered evaluator trajectory.
- [x] 2.5 Verify failure isolation using on/off/failing recording variants in observe and enforce modes; assert unchanged decisions, approval lifecycle, permissions and executor counts, including early guard failures.

## 3. Standalone read-only backend

- [ ] 3.1 Add archive indexing, project filtering, paginated session/invocation summaries and on-demand detail reads; verify multi-project fixtures, repeated refresh, historical snapshots and incomplete-stage results.
- [ ] 3.2 Add a loopback-only standalone server with per-launch token authentication, Host/Origin checks and no-store evidence responses; verify unauthenticated, cross-origin and non-loopback access cannot disclose data. Authentication was subsequently removed at the owner's explicit request; this original requirement is superseded. See `docs/KVG-5168-handoff.md`.
- [x] 3.3 Expose only read APIs and built frontend assets through bounded ID-based routing; verify traversal/symlink attempts, unexpected HTTP methods and arbitrary-file requests are rejected and the server never imports Pi or invokes an evaluator.

## 4. Svelte inspector

- [ ] 4.1 Add the isolated Svelte + Vite frontend and build/dev/standalone-launch scripts; verify a production build is served by the standalone backend without loading the Pi extension.
- [ ] 4.2 Build the cross-project session browser and paginated call timeline with passes, concerns and unavailable states; verify UI tests for project filters, session/invocation deep links and empty/error states.
- [ ] 4.3 Build the rule table and decision detail view using recorded snapshots, distributions, thresholds and gates; verify FAIL, UNKNOWN, PASS-below-threshold, WARN, approval and built-in integrity examples receive distinct labels.
- [ ] 4.4 Build questions/choices, submitted evidence and response views with explicit redaction, omission, truncation and missing-data indicators; verify hostile markup is inert and changed current policy/questions cannot affect historical displays.
- [x] 4.5 Add two-second live polling with preserved selection and separate permission/execution fields; verify new sessions and stages appear without reload, reconnect resumes reading, and absent tool results remain unknown.

## 5. Documentation and end-to-end verification

- [ ] 5.1 Document default-on sensitive persistence, storage location, opt-out, owner-only limitations, standalone launch, project/session navigation and manual removal; verify every documented command and configuration example against the implementation.
- [ ] 5.2 Add an offline end-to-end fixture that records calls with the inspector stopped, restarts the reader and resumes the same session; verify retained exact evidence, all-rule inspection and new live stages with no provider network calls.
- [x] 5.3 Run the full Bun tests, Pi smoke tests, typecheck, frontend checks/build and diff checks; record results and any unsupported runtime or browser coverage explicitly.
- [ ] 5.4 Inspect synthetic live and historical sessions in the owner's Arc browser, including rule selection and hostile evidence rendering; record the visual verification or an explicit Arc-connection blocker without substituting another browser unapproved.
