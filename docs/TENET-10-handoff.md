# TENET-10 archive metadata refresh

The archive reader now walks root and session directories with persistent, bounded cursors instead of listing and statting the entire archive on each request. It visits at most 128 root entries and 512 stage entries per refresh, still parsing no more than 256 changed stages or 16 MiB. Stage cursors take turns across sessions; one cursor slot rotates to waiting sessions when 256 are open. Root and stage deletion reconciliation also run in bounded rounds. Issue counts update with entries instead of rebuilding them on each refresh. Root replacement clears the cache immediately, and a replaced or unsafe session directory drops its entries when visited. Detail reads still use the private-file validator, independent of the metadata cache.

The tradeoff is delayed discovery and invalidation on large archives. Small archives usually complete a sweep within one refresh. For large archives, a deleted or altered cached stage can remain in summaries until its cursor reaches it; detail reads still validate the actual file. An initial incomplete sweep reports `indexing-in-progress`. A later reconciliation sweep does not report cold indexing solely because it is unfinished. Root and stage cursors can remain open across refreshes, with at most 256 open session cursors.

## Measurement

Measured on this macOS host with Bun 1.3.14 using real `ArchiveWriter` records carrying a 1 KiB payload per stage. Each layout contained 4,096 stages. The same fixture and five warm refreshes were run before and after the change; values are wall-clock milliseconds, not a cross-machine performance guarantee.

| Layout | Before cold | Before warm | After cold | After warm |
| --- | ---: | --- | ---: | --- |
| 1 session x 4,096 stages | 16 refreshes, 2,572 ms | 51, 49, 50, 54, 55 ms | 16 refreshes, 1,733 ms | 10, 8, 7, 6, 6 ms |
| 256 sessions x 16 stages | 16 refreshes, 3,855 ms | 79, 79, 83, 83, 79 ms | 17 refreshes, 2,378 ms | 23, 15, 14, 15, 14 ms |

The bounded initial root walk adds one refresh for the 256-session layout. Cold time is lower here, but those numbers also include disk-cache and scheduling noise. The warm reduction is the relevant result. On a 10-second poll, a deep archive no longer forces 4,096 file stats on every request.

Validation: `bun run inspector:build`, `bun run typecheck`, `bun run inspector:check`, `bun test --isolate --max-concurrency=1 --timeout=30000` (353 passed), and `CI=1 bun run inspector:test` (14 component and 23 browser tests passed). The broad test command needed `TMPDIR=/tmp` because the context-mode sandbox's temporary path makes the Claude bridge socket exceed its existing 100-byte path limit; the first run had three unrelated path-limit failures. Index tests cover progress past the 256-cursor cap, bounded root deletion, incremental issue counts, deep-directory traversal, changed and unsafe files, root/session replacement, parsing budgets, and detail limits.

The single read-only completion review initially blocked the change on cursor-cap starvation and archive-sized reconciliation work. The final diff addresses those findings; no second review pass was run. A later file change or deletion in a large archive can remain in a summary until a bounded sweep reaches it. With more than 256 simultaneously deep sessions, probe sessions may advance slowly while 255 long cursors hold their places. Detail validation remains immediate for selected files.
