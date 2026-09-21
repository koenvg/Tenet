# KVG-5170: inspect failed and incomplete assessments

## Scope

Implemented the failure-handling slice of `add-standalone-decision-inspector`, under KVG-5158, on top of KVG-5168. Read the approved proposal, design and all three delta specs. Ran `bun i` successfully without a lockfile change. No evaluator questions, gates, enforcement outcomes or approval semantics changed.

## Behavior

- The inspector exposes safe failure categories separately from missing assessment data. A recorded decision timeout stays a timeout even when transport cancellation arrives afterward.
- Submission markers distinguish requests not submitted, retained submitted payloads, submitted requests whose payload is missing, and unknown submission with incomplete capture. No payload is reconstructed.
- Invalid responses remain bounded untrusted snapshots alongside validation. Snapshot copying excludes credential/header fields and rejects error instances, getters, custom serialization and excessive depth/value counts. Truncation, omission counts and unavailable snapshots are explicit. String-embedded secrets remain possible.
- Temporary, corrupt, unsupported and unsafe/unreadable records have separate issue categories. Temporary content is not read. Valid records remain browsable, and absent decision/response/execution stages are not inferred as successful.
- Queue overflow, serialization/write failures and drain timeouts update owner-only counters. A reserved immutable health write persists cumulative writer-wide counters when storage permits, without recursively enqueueing health or retrying in a busy loop. The reader selects the latest snapshot per writer instead of adding cumulative counts. Counts may span sessions.
- The existing layout now shows assessment and submission states above evidence, opens failed-response details, and provides expandable file issues and writer health. Existing Pi records and evaluator trajectory receive none of this evidence or capture-health data.

## Verification

Final verification with Bun 1.3.14 on macOS:

- `bun test`: 188 passed, zero failed.
- `bun run smoke`: three passed, zero failed.
- `bun run typecheck`: passed.
- `bun run inspector:check`: zero errors and warnings.
- `bun run inspector:test`: production build and DOM/HTTP tests passed, including reader restart and failure-state selection.
- `git diff --check` and strict OpenSpec validation: passed.

Ten new focused tests cover retained provider failures and missing credentials; per-file corruption/unsupported/temporary states; unsafe response serialization; overflow; disk failure and recovery; bounded shutdown; actual child-process exit after evaluator submission with a torn temporary file; owner-only live/recovered context; timeout/cancellation ordering; and submission metadata surviving a missing payload. The existing recording on/off/disk-failing matrix still verifies both modes, approval behavior, permissions and executor counts. All provider traffic was scripted locally.

Arc's existing signed-in instance was connected through its existing localhost CDP endpoint. Inspected the incumbent UI before editing, then desktop and 390px failure layouts. Confirmed invalid-response labels, unknown execution, submission status, issue categories and writer-health details. Hostile response markup stayed inert, and mobile had no horizontal overflow. Restored the browser's normal viewport afterward. Temporary screenshots are `/tmp/tenet-5170-desktop-final.png` and `/tmp/tenet-5170-mobile-final.png`.

The Impeccable detector reported only the pre-existing selected-item inset stripe in `inspector/src/style.css`. It was retained to preserve the existing interface; this task does not redesign selection styling.

## Limits and parent work

Capture remains best-effort. A drain timeout is not proof of permanent loss. If storage never recovers or the process exits before a health write, only live owner reporting may be available. Temporary records may also be active writes, so the reader does not label every temporary file a confirmed crash. These are explicit product limits, not guarantees of transactional durability.

Marked OpenSpec tasks 1.4 and 2.4 complete, bringing the parent change to 12/22. Broader indexing, project filtering, deep links, polling and full rule-table work remain under the parent. The change is not ready to archive. This slice was not separately run on Node 22; Bun tests include the pinned Pi smoke integration. No live-provider evaluation was performed.

## Rebase onto main

Rebased onto `2b4b14e`, which adds KVG-5171 live lifecycle updates. Resolved the App and UI-test conflicts by retaining polling, reconnect behavior and selection preservation alongside failure inspection. Polling now refreshes capture-health data at each API level. The combined UI test covers live updates, reader restart and failure history without the removed manual-refresh control.

After conflict resolution, all 188 tests, three Pi smoke tests, TypeScript checks, Svelte checks, the production build and combined DOM/HTTP tests passed. Diff checks passed. The earlier references to polling as parent work describe the pre-rebase state; polling is now supplied by main. Arc visual checks were not repeated for this rebase.

## Rebase onto indexed archive browsing

Rebased again onto `5544cd6`, which adds KVG-5172 archive indexing, canonical project metadata, project filtering, cursor pagination and deep links. Resolved four conflicted files while preserving those features and the failure inspector. The metadata index now retains only derived failure/assessment labels and numeric health counters, exposes distinct recording-issue categories, and serves capture health without rereading response payloads. Canonical project resolution also applies to recovered health records.

Added a regression test comparing indexed failure summaries with detail views and checking that warm metadata/health queries do not reread evidence. After resolution, 196 tests, three Pi smoke tests, TypeScript and Svelte checks, production build, combined UI tests, diff checks and strict OpenSpec validation passed. Earlier descriptions of indexing, filtering and deep links as parent work describe the pre-rebase state. Arc visual checks were not repeated for this rebase.
