# KVG-5172: browse concurrent and resumed sessions

## Scope

Implemented the cross-project browsing slice of `add-standalone-decision-inspector`, building on KVG-5168. OpenSpec tasks 3.1 and 4.2 are complete, bringing the parent to 12/22 tasks. The parent change remains open.

## Implementation

- Recording preserves original session IDs and captured working directories. Writers also capture canonical project paths asynchronously, falling back to the original cwd when resolution fails. Existing archives remain readable without migration.
- `src/inspector/archive-index.ts` owns the rebuildable metadata cache, exact project filtering, session counts, timestamps, cursor pagination and selected-invocation detail reads. Session concern counts count ASK/BLOCK decisions; unavailable counts mean no decision was captured. Lists include incomplete stages and best-effort coverage rather than claiming complete histories.
- Cold indexing reads existing stage envelopes once and discards evidence. Each refresh parses at most 256 new or changed stages and 16 MiB. Subsequent refreshes inspect file metadata but do not reread unchanged evidence. Detail reads are uncached and restricted to the selected session/invocation, with limits of 64 stages and 16 MiB. Limits produce explicit issues. Deletion, corruption and changed permissions invalidate cached entries.
- The read-only API supports project filters and query-bound cursors, with a default of 50 rows and a maximum of 100. Sessions sort by first captured timestamp; invocations sort by their first stage. Resumed activity updates the displayed timestamp without moving a session across the existing pagination boundary. Hashed IDs resolve records, never caller-supplied paths.
- `inspector/src/App.svelte` adds project filtering, summary counts/timestamps, incremental pagination, loading/empty/error states and address-bar deep links. Links contain only session/invocation hashes. Fresh launches and browser history restore selected calls independently of the first timeline page. Pagination preserves detail selection, and stale navigation responses cannot replace the current selection.
- A guard regression test exposed ambiguous result attribution after a session switch with reused host call IDs. Pi's result event lacks invocation/session identity. Such results now remain unknown and their content is omitted from subsequent evaluator trajectory with an explicit limitation, rather than being attached to a potentially unrelated invocation. This does not change permission or approval handling.

## Verification

Verified with Bun 1.3.14 on macOS:

- `bun i`: installed successfully without lockfile changes.
- `bun test`: 185 passed, zero failed.
- `bun run smoke`: three passed, zero failed.
- `bun run typecheck`: passed.
- `bun run inspector:check`: zero errors and warnings.
- `bun run inspector:test`: production build and DOM/HTTP tests passed.
- `openspec validate add-standalone-decision-inspector --strict`: passed.
- `git diff --check`: passed.

New tests cover separate concurrent writer processes targeting the same and different projects, fresh-reader restarts, resumes, forks, reused call IDs, Unicode/path-like/NUL-containing original session IDs, session and invocation pagination, invalid/cross-query cursors, exact writer-to-evidence attribution, canonical project aliases, cache reuse, unsafe/corrupt files and byte/record limits. The guard regression verifies that late reused-ID result content cannot enter the next invocation's trajectory.

Production-client tests cover project filters, unavailable calls, pagination without losing detail, arbitrary session IDs, fresh deep-link launches beyond the first page, history navigation, invalid links, empty filters, HTTP failures and retry recovery. Existing pass/concern, historical evidence and hostile-markup tests still pass. No provider network calls were made.

The owner's existing Arc instance was connected through localhost CDP. A synthetic archive was served on loopback. Project filtering and selection of a Unicode session ID worked; selected detail and ID-only deep links were inspected at desktop and 390px mobile widths. No horizontal overflow was detected. Screenshots were inspected at `/tmp/tenet-5172-desktop-detail.png` and `/tmp/tenet-5172-mobile.png`. The viewport override was cleared afterward. The mechanical UI detector reported only the pre-existing selected-button inset stripe, which was preserved with the incumbent design.

## Remaining parent work and limits

Automatic polling is not part of this slice. Refresh controls discover new stages and advance incomplete cold indexing. A cold reader still parses stage files because the existing archive format has no separate persisted summary index; it never retains all evidence in memory. Directory enumeration and cached metadata scale with archive size. Project suggestions come from loaded session pages; any exact project path can be entered.

Reused host result IDs cannot be disambiguated from Pi's result event, so their execution remains unknown rather than guessed. Capture remains best-effort. No retention policy, archive migration, remote access, evidence replay or authentication was added. The owner's earlier authentication removal remains in effect. Node 22 was not separately exercised in this slice; tests ran on Bun. Other unchecked parent tasks remain unchanged.

## Rebase onto current main

Resolved the overlapping live-polling changes from `main` without dropping either feature. Polling now keeps the active project filter, uses cursor pages to retain the loaded list length, and ignores responses superseded by navigation or manual refresh. The earlier note that automatic polling remains parent work is superseded by this integration.

Combined UI tests cover automatic discovery, reconnect recovery, delayed execution updates, preserved rule selection and scroll, plus filtered pagination and deep links across polling cycles. After conflict resolution, all 185 tests, three smoke tests, TypeScript and Svelte checks, the production build and combined UI tests passed.
