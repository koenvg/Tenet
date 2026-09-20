# KVG-5095 handoff

## Delivered

OpenSpec slice 3, tasks 3.1 through 3.3, is complete.

`src/pi/approval.ts` serializes TENET's native confirmation dialogs. Each prompt displays the assessed session, tool/call identity, policy digest, original-argument digest and redacted arguments. Cancellation blocks the invocation immediately, but the dialog slot stays occupied until the underlying UI promise settles. This prevents an uncooperative or late UI response from overlapping the next confirmation. Queued calls are rechecked before display.

`TENET_APPROVAL_TIMEOUT_MS` defaults to 60000 and includes queue time. It must be an integer from 1 through 2147483647. Timeout aborts the UI signal and never grants permission. Judge deadlines remain separate.

`src/pi/guard.ts` binds each invocation to a lifecycle generation, session, selected policy and assessed original arguments. It rechecks those bindings before release. Session start, shutdown, switch/fork/tree hooks and agent end invalidate pending work. A detected policy change invalidates pending calls and remains unavailable until reload. Overlapping startup loads cannot replace a newer lifecycle's configuration. Revocation takes effect before audit writes, including when the host cannot persist an entry.

Audit records carry an independent `invocationId`. ALLOW, native approval, released permission and observed execution are separate records. Matching tool results record executed or failed; released calls without an observed result become unknown at agent end or invalidation. A failed tool can still have remote effects. An unknown outcome cannot supply approval for a retry. Duplicate host session/call IDs invalidate pending work; the in-memory seen-ID set stores no authorization and is not reconstructed from history.

Recovered transcript entries remain untrusted observations. Neither a historical approval record nor a task claiming consent populates executable permission.

## Verification

- Red tests reproduced overlapping native dialogs, missing queue deadlines, missing lifecycle cancellation, mismatched result attribution, duplicate call ambiguity and stale queued prompts before their fixes.
- An additional red test reproduced execution after a lifecycle audit write failed. Revocation now happens first.
- `bun test`: 98 passed across 11 files.
- `bun run smoke`: 2 passed against Pi 0.85.1.
- `bun run typecheck`: passed.
- `git diff --check`: passed.

`test/approval-lifecycle.test.ts` exercises the registered Pi hooks with injected judge/UI responses and an executor spy. It covers concurrent publications, denial/dismissal, active and queued aborts/timeouts, argument changes including redacted fields, changed tool/call/session identity, lifecycle changes during assessment and approval, late judge/UI responses, policy changes and reload, forged transcript consent, retries, duplicate IDs and outcome attribution.

`test/pi-smoke.test.ts` uses the real resource loader, AgentSession dispatch and dummy executors. An earlier extension mutates arguments before TENET runs. The test checks the expected post-mutation payload in both the assessed snapshot and the executor, including its original-argument digest. Concurrent-hook scenarios use the offline host; the smoke invokes calls sequentially.

## Host contract and limits

Load TENET after argument-mutating tool-call extensions and register it after mutating handlers within the same extension. Pi must await and honor the returned block, honor cancellation before dispatch, supply unique call IDs within a session, and deliver lifecycle events before runtime teardown. The host must prevent later hooks or retained references from changing arguments after TENET returns permission. TENET does not freeze executor arguments or external state.

Only TENET's dialogs are serialized by this queue. If native UI never acknowledges cancellation, later confirmations remain queued and can time out. Other extensions' UI and host behavior remain outside this queue.

No live Jev request, remote publication, browser operation or remote-state verification was performed. These tests establish enforcement mechanics, not semantic accuracy or successful publication. A crash can prevent an unknown-outcome record from being written; missing results must never be treated as success. No reusable tokens, approval database, executor adapters or protected execution environment were added.

Restart the full Pi process after deploying code changes. Check startup readiness and the policy digest. Policy-only changes may use the documented reload path.
