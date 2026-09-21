# KVG-5168: record and inspect an assessment

## Scope

Implemented the first end-to-end slice of `add-standalone-decision-inspector`, under KVG-5158. Proposal, design and all three delta specs were read before implementation. No evaluator questions, probability gates, decision aggregation or approval semantics were changed.

The slice records passing and concerning SDK assessments by default, persists them outside Pi session diagnostics and serves them in a standalone Svelte inspector after the guard shuts down. The parent change is not complete and must not be archived yet.

## Implementation

- `src/recording/contract.ts` defines versioned stages, invocation identities, best-effort sinks and bounded response snapshots. `archive.ts` owns independent config, hashed session paths, unique writer/event IDs, the asynchronous queue and immutable atomic writes. `files.ts` checks containment, symlinks, owner permissions and read sizes.
- `src/decision/jev.ts` submits one frozen application payload and captures that payload, the question mapping, SDK response and validation. Scripted transport tests compare persisted questions, choices and state with the SDK's outbound JSON, including redaction and omitted history.
- `src/pi/guard.ts` binds recording to each invocation and captures policy/config metadata and existing lifecycle stages. Capture-only UI reports have their own non-throwing boundary, including in enforce mode. Asynchronous write failures update owner status without waiting for another tool call. No archive payload is appended to Pi records or evaluator trajectory.
- `src/inspector/` exposes loopback-only read APIs and built assets without authentication. It imports neither Pi nor the SDK. IDs, rather than caller-supplied file paths, select sessions and invocations. Responses use no-store and restrictive CSP; Host/Origin checks apply from startup.
- `inspector/` contains the isolated Svelte/Vite client. Select session, invocation and rule; inspect recorded policy, questions, shared evidence, response, gates and probabilities. Permission and execution remain separate. Content is escaped text, not HTML or Markdown.
- README documents the new sensitive persistence default, opt-out, launch, storage permissions, limits and manual removal. Existing tests opt out or use temporary archives so they do not write into the owner's real archive.

## Verification

Verified with Bun 1.3.14 on macOS:

- `bun install --frozen-lockfile`: passed.
- `bun test`: 178 passed, zero failed.
- `bun run smoke`: 3 passed, zero failed. The production-extension test also checks default-on recording of a not-submitted attempt in a temporary archive.
- `bun run typecheck`: passed.
- `bun run inspector:check`: zero errors and warnings.
- `bun run inspector:test`: production frontend build and DOM/HTTP end-to-end test passed. Scripted pass and concern records survive writer shutdown; rule selection, integrity, hostile evidence and unknown execution are exercised.
- `bun run inspector`: the documented launch command served the built app with HTTP 200 and CSP headers.
- `git diff --check` and strict OpenSpec validation: passed.
- A fresh Bun process started the backend and read the retained session with no evaluator credentials. The backend also bundled as five modules and served the retained session on Node 24.14.0. Node 22 was not run separately.
- Arc's existing signed-in instance was used through its existing localhost CDP connection. Desktop and 390px layouts were inspected. Pass, concern and integrity selections worked. Submitted script markup remained visible text and did not execute. The token fragment was removed. No alternate browser was launched.

The failure-isolation matrix compares recording off, on and disk-failing in observe/enforce modes, including native approval and executor counts. Additional tests cover capture-only UI failures, queue overflow, schema errors, oversized/public/symlink files, concurrent writers, resumed/forked sessions, late SDK completion across a session switch, timeout and missing credentials. No live provider calls were made.

## Parent work still open

This ticket does not implement project filtering, deep links, live polling, lazy archive indexing or a separate authenticated Vite development origin. Current lists are paginated but each API request scans stage files. Large archives will need the planned index.

The queue exposes live owner counters, but durable recovery-health records and broader fault-injection coverage remain parent work. Working-directory metadata currently retains the captured host path; canonical project-path grouping remains with project filtering. The UI presents recorded fields and gate IDs rather than the parent's full friendly rule table and tab design.

Only fully covered OpenSpec tasks are checked. Other tasks may contain implemented pieces but remain unchecked until their full behavior and verification are delivered. No retention expiry, migration, provider replay, policy editing or browser approval was added.

## Authentication removal follow-up

The owner explicitly requested removing authentication entirely. Token generation, authorization checks, the environment flag and client auth handling are removed. The inspector opens directly at its plain local URL. Loopback binding, Host/Origin validation and read-only routing remain. This supersedes the original plan's authentication requirement; any local process can read the archive.

Verification after removal: 178 tests, three Pi smoke tests, TypeScript and Svelte checks, production build and the direct-access UI test passed.
