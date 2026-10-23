# Read Tenet status in BB

Use this experimental BB plugin to read recorded rules for a thread, inspect flagged checks and compare project rule rates. Existing history needs a readable, exactly linked archive on the thread's machine, not a running Pi process.

New capture needs the installed Tenet Pi extension, an owner policy and recording enabled. The plugin does not activate Tenet, launch Pi, change enforcement, approve actions or supply TypeSafe credentials.

## Install

Local recordings can contain secrets despite redaction. This read-only view is not a protection, approval or confidentiality boundary. Before enabling capture, read [capture and deletion limits](../docs/inspector.md#sensitive-local-storage).

1. Complete the separate [Pi installation](../docs/INSTALL.md). Configure the policy and credentials before any real assessed action. Those actions disclose evidence to TypeSafe and use quota; installing this read-only plugin makes no evaluator request.
2. Complete the [locked development setup](../CONTRIBUTING.md#set-up). From the root of a stable Tenet checkout, build and install the plugin:

   ```sh
   bun run plugin:build
   bb plugin install /absolute/path/to/Tenet/bb-plugin-tenet-status
   ```

   Replace the path with this checkout's plugin directory.

   The build prepares `.server-workspace/server.js` from the current `server.ts` and its shared source. BB loads this plugin-local entry so no server import leaves the plugin directory. Keep the generated files and locked dependencies in the stable checkout.

   To update an existing local-path installation, rebuild from the same checkout, then run `bb plugin reload tenet-status --json`. A zero exit code and no failed-reload status in `bb plugin list --json` confirm activation. Do not remove and reinstall the plugin. Removal deletes its settings. A successful build alone does not prove activation.

3. Start a fresh Pi process with the current extension and recording enabled. Do not set `TENET_RECORDING=off`.
4. Open its BB Pi thread and select **TENET rule status** in the header, or **T** on compact viewports.

Only new Pi records with a valid BB-provided `BB_THREAD_ID` link to the thread. This routing hint changes neither Pi session keys nor policy decisions. Historical unlinked records stay in [the standalone inspector](../docs/inspector.md). The plugin never guesses a thread from cwd, time or native session ID.

## Browse from the main Tenet page

After installing the plugin, open **TENET** in BB navigation. This experimental current-machine view works with stopped Pi processes when their BB metadata, connected machines and private archives remain reachable. No evaluator credentials are needed for reading.

Policy previews can contain secrets. Selecting a project reads its accessible recorded Pi history, including hidden, archived and pi-subagents threads. It does not call TypeSafe, change policy or read raw call details for counts.

1. Choose a project. The picker reads BB metadata only. **Next projects** continues its 50-name pages.
2. Read the automatically loaded **Rule**, **Passing** and **Failing** table. It includes PASS-only rules and recorded declarations without scored checks. A zero denominator displays **Not checked**.
3. Select a rule to see its flat **Failures** table. Each row names the thread, tool and time. **Open call** opens that exact recorded call in the existing overview.

   **Next failures**, **Previous failures** and **First failures** move through 50-row pages. The displayed range identifies the current page. **Back to rules** returns to the rates; no failures produces a plain empty state.
4. Use **Change project** to choose another project. **Refresh** replaces the run. **Cancel** stops further loading requests and labels retained results partial. There is no interval polling in the project overview.

`Project → Rule / Passing / Failing → Failures → Open call` is the main flow. One short warning appears beside the table when history is materially partial or unavailable.

Rate descriptions expose the scored denominators to assistive technology. The counting and coverage reference below explains the limits; there is no technical details panel in the project display.

### Understand recorded rule rates

Passing is trusted recorded PASS / (PASS + FAIL); failing is trusted recorded FAIL / (PASS + FAIL). Unknown, not applicable, invalid, unavailable, approval-only and unchecked observations are unscored.

A trusted selected PASS can coexist with uncertainty gates. These rates describe recorded outcomes, not safety or compliance probabilities. BLOCK, permission and execution do not create checks.

Identical complete recorded wording merges across branches, policy versions, declaration IDs and enforcement severity. Integrity rules stay separate from owner rules. Public native session-rule identities remain version-qualified.

The host hashes the full exact wording, not the bounded preview. Different suffixes remain distinct even when previews match; missing wording stays invocation-isolated.

Each qualified invocation contributes one passed, failed or unscored observation per logical rule. For duplicate wording in one invocation, any trusted FAIL yields failed; passing requires every matching declaration to have trusted selected PASS; otherwise the observation is unscored.

Retries do not add observations. Failure-detail rows contain exactly the retained failing invocations counted by the selected rule.

The table describes retained recorded declarations, not a live inventory of today's policy files. Finished enumeration still means best-effort capture. No recordings is unknown, not a fabricated rule inventory or pass.

Processed, partial, unprocessed and unavailable are separate thread buckets. Unknown is a subset of processed threads: the exact association search completed with no eligible linked history. Capped or unvisited work stays unprocessed, not unknown or “no recordings.”

Linked threads with useful retained observations and omissions stay partial. Unavailable means owner resolution or host access failed without linked observations. Machines are observed at different times, with no former-host search.

Changed access, project membership, provider, environment, machine or archive settings invalidate the run and clear results on the next request. Runs expire after ten minutes. A failed continuation clears results; use **Refresh** to retry rather than combining incompatible snapshots.

### Inspect a failing call

1. In a rule's **Failures** table, select **Open call**. Choose a **Linked session**, **Finding category** and call in the existing summary workspace as needed. Missing or unlinked history is unknown, not pass.
2. Use browser **Back** and **Forward** to restore project, thread, session, category or call selection. BB owns this history. Links contain bounded scope and opaque record identifiers, not archive paths, machine selectors or raw payloads.

   Returning from **Open call** restores the rule, failure range and originating call focus only after fresh owner access and revision checks. An unchanged retained run needs no new scan. Expired or changed history clears results and offers **Refresh**.
3. Use **Back to project rules** or **Choose project** to change selection. **View flagged rules** and old thread findings links keep the focused findings route.

An overview reads only its selected thread's archive. Non-Pi, deleted, unreadable and changed-project selections clear old results without requesting an unsupported archive. The project picker contains at most 50 names per page. The current SDK has no project-page API, so the owner RPC pages its authorized metadata list without requesting included threads.

Live reads preserve selection and mounted disclosures when the scope and revision are unchanged. A source revision change discards dependent inventory, check and call pages together. Fresh polling starts at page one without replaying continuation cursors.

Use **Refresh archive** to restart session, call and rule pagination. It keeps the selected session, call and category, including a detail outside the newest page. Load older session pages again for their counts.

Each workspace has one ten-second polling owner and an eight-second timeout. Disconnects, lost archives, unreadable scopes, timeouts and rejected cursors clear old results. Polling pauses after a failed read. Reconnect the selected machine or check its owner archive setting, then use **Refresh archive** to retry from page one.

An environment, machine or owner archive change clears the old scope. Refresh from page one; do not use another machine's archive as a fallback.

## Browse calls beside a conversation

After the separate installation steps above, the thread action opens a flush overview tab beside the conversation. Repeating the same open requests focus of that tab. Controls respond to the panel width, even inside a wide window.

1. Open a Pi thread and select its **TENET rule status** header action. The overview defaults to **Recorded rules for this thread** in both the sidepanel and the main page.
2. Read every retained declaration across this exact thread's linked sessions. **Violation found** marks a recorded finding. **No violations found**, **Unclear** and **Not checked** retain their standalone meanings. Unknown inventory and partial coverage are never a pass.
3. Select a rule to see its **Recorded checks**. Select **View recorded call** for the existing safe call summary. The back controls return to checks and the rule inventory.
4. Use **More recorded rules** or **More recorded checks** for 50-item pages. The reader retains at most 1,024 aggregated rules and 4,096 checks per rule. Coverage, indexing, missing integrity and omission counts stay explicit. A finished page does not prove complete capture.
5. Select **Browse calls** for the secondary session and call browser. Its **Linked session**, **Finding category**, **More sessions** and **More invocations** controls retain their existing behavior. A compact call browser offers **Calls** and **Summary**. **Back to recorded rules** restores the default hierarchy.

The default inventory loads no selected-call detail. Recorded policy identity and declaration ID keep historical versions distinct. Conflicting wording stays uncertain, and absent policy identity keeps invocations separate. This view never reconstructs rules from current policy files.

Evaluator failures use safe reason codes such as `provider-error`. They do not count as selected FAIL or unfinished assessments, even if the tool ran. Select **Browse calls** to open **Archive warnings**, which can concern other threads. No record means unknown, not pass.

Inside a selected call summary, open **Why this assessment**, then **Browse all rules**, and use **More rules** for its 16-rule pages. Text over 2,048 characters has an explicit omission marker.

**View flagged rules** retains the focused findings page. Restored non-Pi panel tabs state unsupported and request no archive.

### Inspect raw evidence on the selected machine

BB shows one selected-only scalar `command`, `path` or `file_path` from the retained request, capped at 4096 UTF-8 bytes. It preserves stored whitespace and marks shortening. This recorded value is not proof that the tool ran.

BB has no raw argument, Evidence or Response view. Use the [standalone inspector instructions](../docs/inspector.md) on the selected machine with the same private archive setting. Keep its loopback listener local. Opening the BB panel starts no listener. Recorded commands, paths and rules can contain secrets; do not paste them into BB messages or notifications.

## Read status

The neutral header action is always available on Pi threads. A compact count appears only for validated recorded selected FAIL calls, including WARN and built-in integrity. No passing-call badge, toast, transcript message or agent tool is installed.

1. Select **View flagged rules** to open the selected thread's findings.
2. Read each rule's loaded-call count and **Uncertain** marker, if present.
3. Expand a rule for call IDs, confidence and its policy snapshot.

Repeated calls group by recorded rule ID and policy snapshot, not today's policy text. WARN and integrity stay distinct. Low-confidence FAIL is a finding, not a confirmed breach. A flag proves neither blocking nor execution.

A short incomplete-coverage warning stays visible. Approval conditions and recording gaps have a compact disclosure. Open it for counts, UNKNOWN, evidence/confidence gates and incomplete-assessment explanations. These are not rule failures. Counterfactual BLOCK, approval requirements and gates without FAIL do not count as findings.

### Read older calls or refresh

The header and details page poll every ten seconds while mounted. The header polls even with its popover closed; details do not navigate away from the selected thread.

Group counts cover loaded calls only. Use **Load more findings** for older calls. After loading older pages, live reads check availability but preserve those calls. **Refresh findings** restarts at page one with updated calls.

Failed reads clear old results and show unavailable. A rejected cursor offers a page-one refresh. Reads time out after eight seconds. Closing or switching the view disposes timers and ignores late results.

## Machines and custom archives

Reads run on the Pi thread's actual BB machine, resolved from its environment. The default archive is `~/.tenet/recordings` on that machine, not the BB server. The machine must be enrolled and connected. A disconnected host has no local fallback.

If Pi uses `TENET_RECORDING_DIR`, configure the same absolute path per machine in owner BB plugin settings:

1. Run `bb machine list` to find the machine ID.
2. Replace the example machine ID and archive path below with yours. From the checkout, run:

   ```sh
   bb plugin config tenet-status set recordingDirectories '{"host_abcdefgh1234":"/home/me/tenet-recordings"}'
   bb plugin config tenet-status
   ```

3. Check that the returned setting matches the writer's path. Refresh the thread's findings.

The plugin cannot read the Pi process environment or discover a custom path automatically. Paths must be normalized, absolute and private to the current host user. Symlinks are rejected.

## No findings or unavailable status appears

- Missing, unreadable or disconnected archives report unavailable. Connect the correct machine and check its private archive path.
- An existing readable archive with no linked records reports unknown, never clear. Check recording and `BB_THREAD_ID`, then restart an older Pi process. Do not assign historical records by inference.
- Large archives can need several refreshes. Check indexing gaps and missing-stage notices.

Coverage is always incomplete. Files can be absent, disabled, dropped or not yet indexed. No recorded FAIL, or a released call, does not prove safety. Removing the plugin does not stop Tenet or delete recordings.

## Limits and privacy

A project run retains one project ID and at most 128 threads. Each discovery step reads one 50-thread window, with hidden and archived threads included; at most 512 windows are processed per run. Project runs resolve only the selected project. The metadata picker uses the SDK's unpaged `projects.list({ includePersonal: true })` and returns 50-name pages. The upstream metadata response itself is not bounded by this plugin.

Each reading step resolves at most eight new targets or advances one destination. Before returning results or contributor pages, the owner rechecks every retained target against current access and placement; the 128-thread cap bounds these checks. Rule and failure pages contain at most 50 items.

Strict dashboard requests accept scope, opaque run/continuation tokens or result selection only. Failure requests also require `expectedRevision`, a nonnegative integer matching the displayed summary revision. A mismatch returns `restart-required` with no items and clears the view's results; use **Refresh** to load history again.

The owner retains at most four runs, with 16 MiB of contribution data and 32 MiB of retry responses per run. Old runs are evicted or expire after ten minutes. Limits of 10,000 invocations and 4,096 rule rows stop acceptance with visible limited coverage. Immutable step responses replay retries without adding counts; result cursors bind to the current revision.

A host admits at most four active ten-minute runs. Completed runs release admission slots and enter a separate four-run FIFO retry cache. Evicted or expired tokens require a fresh run.

Each run retains at most 16 MiB of retry replies, with a 1 MiB reserve before another chunk. Completion, expiry and disposal close traversal cursors; completion clears the active timer.

Dashboard acquisition makes at most 128 scanning advances. Each advance allows 128 root-entry reads, 512 filesystem-entry work slots, 256 stage reads and 16 MiB of input bytes. Traversal resumes at its cursor rather than requiring a complete retained global archive.

Unrelated records are compacted after exact schema, host and thread filtering. A work cap leaves unvisited threads unprocessed. Useful groups from completed sessions remain; unfinished-session groups are omitted.

Selected facts have an 8 MiB charged serialized-retention budget and at most 10,000 invocation groups. Each invocation permits 256 stages and 256 KiB of charged facts. Overflow omits the entire invocation rather than scoring truncated history.

Folding processes at most one invocation and 65 observations per advance. These byte limits account for retained serialized facts, not measured JavaScript heap.

The same traversal retains only the latest sequence and loss flag per writer, capped at 16,384 writers. Latest recorded failures, dropped records or drain timeouts add an archive-wide `writer-loss` warning, including when the health record belongs to another thread. These health facts do not change rule observations or rates.

Limits, archive issues and capture loss are coverage reasons, not rule outcomes. Writer-health overflow reports limited coverage. Known omitted invocation counts are lower bounds; omitted-thread facts and reasons also matter when the numeric count is zero. No persistent index or database is created.

The browser keeps one return selection in its main-page parent, never in persistent storage. It contains one bounded rule row, run/revision, one rule-page cursor, at most 128 failure-page cursors and one originating call path. It retains no failure pages.

Changing project, leaving project scope, refreshing, invalidating or unmounting the parent discards it. Each return rereads authorized owner results and the revision-bound failure page before restoring call focus. Direct links work without retained state; reloading the page starts fresh.

Dashboard counts use the metadata snapshot and existing recorded-rule fold after exact schema-3/4/5, `host === 'pi'` and BB-thread filtering. They never request selected-call detail or reread evidence. Refreshes do not share a persistent reverse index. Cancelling or unmounting stops browser continuation; already dispatched host work can settle and retained host state expires within ten minutes.

The host caches validated metadata. Each refresh shares a 256-stage/16-MiB parse budget across sessions. The overview performs no full detail read per timeline row. It rereads only the selected call, capped at 64 stages / 16 MiB. The separate focused findings RPC retains its five-candidate page and the same per-candidate detail cap.

The host constructs strict allowlisted summaries before serialization. The per-thread owner request accepts only a thread ID, a tagged inventory, rule-check or selected-call query, or call-browser selectors with scoped cursors. It rejects extra fields, client machine IDs, archive paths and native-session selectors.

The owner response includes an opaque 64-character `readScope` for its resolved thread, environment, machine and archive. It contains no path or machine selector and is not accepted in requests. The adapter never combines different scopes.

The thread inventory transports only opaque policy identities and revisions, bounded declaration labels and excerpts, safe status/count/conflict facts and coverage codes. Labels and excerpts are limited to 512 UTF-8 bytes with shortening or unavailable markers. Check pages allow recognized outcome, reason, gate and contract codes, not freeform reasons or unknown gate strings.

In the call browser, cursors are limited to 512 characters, labels to 256, recorded rule text to 2,048, issue lists to 20 codes, and session/call pages to 50 summaries. Rule pages contain at most 16 rules, including built-in integrity. Summary rules retain recorded thresholds, policy digest and contract versions; they do not read current policy files.

The open selected summary lists at most 16 reported violations from the whole call, before rule-page slicing. Only validated selected `FAIL` outcomes qualify. WARN stays advisory, and uncertain FAILs remain labeled.

Missing or invalid assessments never become a clean result. A total and missing-snapshot or text-omission notices identify content not displayed. Use the existing rule browser to continue; pages replace rather than accumulate.

The call explanation uses bounded whole-call facts, separate from the browsed rule page. It keeps the recorded first blocking gate, scores and thresholds, total blocking-rule count and uncertainty-only marker.

Loading another page does not change the call explanation or increase the 16-rule page limit. This context contains no additional rule text or raw payload.

Select a call, open **Why this assessment**, then **Browse all rules**. Use **More rules** for the next page or **First rule page** to return. Page counts identify rules not shown on the current page.

Text over 2,048 characters ends with `[omitted]`; selected rule details show the number of source characters omitted. Missing text and assessed rules without a recorded snapshot are explicit, not passing results.

Rule cursors bind the operation, thread, linked session, call and recorded snapshot. A cursor from a different selection or changed snapshot is rejected. Use **Refresh archive** to restart after rejection.

Schema-3 and schema-4 records keep their recorded contract, selected probabilities, effective thresholds and known gates. WARN, built-in integrity, uncertainty and approval remain distinct. Released permission does not prove execution.

Schema-5 summaries retain recorded source roles, paths, targets and digests within the same 256-character label limit. Their policy identity uses the recorded combined digest. Missing historical source roles stay unknown; the reader never infers them from paths.

To inspect raw data, open the standalone inspector on the selected thread's machine with the same private archive. Follow the [checkout standalone inspector guide](../docs/inspector.md). A browser-local inspector or another machine's archive is not a substitute. Opening the BB summary starts no listener and adds no Evidence or Response endpoint.

Exact thread association is checked before grouping or counting. A shared native session or resumed Pi session cannot supply another thread's calls. Missing unlinked history remains standalone-only.

Policy text renders inertly, but can itself contain secrets. Summary-only access is not a confidentiality boundary against same-user code or an owner client. The bounded selected command or path is an owner-only exception.

Raw argument bags, private previews, submitted evidence, exact questions, provider bodies and error text stay host-local. Lists, status, findings, logs and URLs gain no action data.

## Shared summary build

The checkout includes one React summary library for both BB entry points. Its rule-first view shares status labels, icons and colours with the standalone inspector, which keeps a separate shell and private recorded-data view. The synthetic comparison checks the common call summary, not the private inspector layout.

Before importing the mount or running its tests, build the ignored `.summary-workspace/` output with `bun run summary:build` from the repository root. `bun run plugin:build` rebuilds that output, then builds the plugin. Building files installs or reloads nothing. A missing or stale shared artifact stops `npm run build` with the required command.

See the [checkout-only summary input, lifecycle and synthetic preview reference](../inspector/summary-workspace.md). Raw evidence stays outside the input. Recorded policy text can itself contain secrets; this is not a confidentiality boundary against same-user code.

## Try the panel offline

From a developer checkout with the locked dependencies installed:

```sh
bun run summary:build
bunx vite bb-plugin-tenet-status --host 127.0.0.1 --port 4174
```

Open `http://127.0.0.1:4174/overview.preview.html?rules` for the rule-focused preview. The synthetic shell keeps a conversation beside the real shared mount and adapter. Try its 390px panel, keyboard navigation, close/reopen and host-disconnect controls.

The default list includes **Violation found**, **No violations found**, **Unclear**, **Not checked** and built-in integrity examples. Select a rule, open a recorded check, then return with the back controls.

Select **Browse calls** to inspect the pass, selected FAIL, WARN, integrity, approval, uncertainty and provider-failure call fixtures. Their selected-call rule browser retains its 16-rule pages and text-omission notices.

This preview reads no archive and makes no evaluator request. It installs or reloads nothing. Without `?rules`, the same default rule-first hierarchy uses the basic call-summary fixtures for drilldown.

If the mount is missing or stale, rebuild the summary library before restarting Vite. The preview does not reproduce native BB tab focus or persistence. SDK tests can verify identical open requests, not installed-host focus. Native tab behavior and deployed remote-host reads need separate authorized checks.

### Try the main page offline

With the same checkout-only Vite preview running, open `http://127.0.0.1:4174/main.preview.html`. Choose a project, read its rule rates, select **Ask before publishing.**, then inspect the single failure row and **Open call**. The mixed example shows nine passing checks and one failing check, or 90% / 10%. PASS-only, mostly passing, failing and unchecked rules demonstrate the other states.

Try **Back to rules**, **Change project** and browser Back/Forward. Use a 390px viewport, or add `?narrow=1` for a narrow container. Optional development fixtures are available at `main.preview.html?fixtures=1`; its small selector provides limited, empty, unavailable, unprocessed, expired-return, error, slow/cancellable and 51-failure paging states. The page has one **Synthetic preview** label, not production fixture controls. All data is authored and reads no real archive or evaluator.

Stop the preview with Ctrl+C. To restart it, run the commands in [Try the panel offline](#try-the-panel-offline) again. The synthetic shell models navigation; it does not prove installed BB history, native panels or deployed machine routing.
### Try live browsing and recovery offline

With the same checkout-only Vite process running, open `http://127.0.0.1:4174/live.preview.html?entry=panel` or `http://127.0.0.1:4174/live.preview.html?entry=main`. Both use the real adapter and shared workspace with authored history and rule pages.

1. Inspect the default recorded-rule list. Select **Browse calls** for the larger session and call fixture. Load **More sessions** and **More invocations**, then select an older call and browse past its first 16 rules.
2. Select **Append recorded stage**. The ten-second poll reads a fresh first page and invalidates older pages when the revision changes. The selected call remains reachable.
3. Select **Disconnect archive** or **Hang archive read**. A failed read or eight-second timeout clears results. Select **Make archive readable**, then the displayed page-one refresh control for manual retry.
4. Select **Reject cursors**, then request **More rules** explicitly. Polling never replays a continuation. A rejected page clears results and needs a manual page-one restart.
5. Try **Calls** and **Summary** in a 390px call browser, browser Back and Forward on the main page, and close and reopen. **Switch thread scope** aborts the previous view's reads. These preview controls select fixtures, not production machines or paths.

Expect one polling owner per workspace and no old result after a failed read. These checks do not prove native BB navigation or remote-host deployment. Stop or restart only this preview as described above.

## Validation

Developer-checkout checks are offline. Use installed frozen dependencies. First build the SDK and inspector as required by [development verification](../CONTRIBUTING.md#check-a-change). Then run from the repository root:

```sh
bun run summary:build
bun test bb-plugin-tenet-status
cd bb-plugin-tenet-status
npx vitest run --config vitest.config.ts
npx tsc --noEmit
cd ..
bun test --isolate --max-concurrency=1 --timeout=30000
bun run typecheck
bun run plugin:build
```

Success means each command exits zero. The parent contribution checks require builds before the full Bun suite; see [development verification](../CONTRIBUTING.md#check-a-change) for prerequisites and failures.

`live-status.test.ts` exercises archive writes and host/owner RPC contracts with separate simulated local/remote machine identities, custom paths, new records, disconnects and archive loss. It does not prove a deployed remote daemon. A release check should repeat the workflow on an enrolled remote host and inspect the compact UI in BB. Offline checks do not claim that release check ran.
