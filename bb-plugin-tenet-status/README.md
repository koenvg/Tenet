# Read Tenet status in BB

Use this experimental plugin to browse recorded Pi calls from the main Tenet page or beside a BB conversation. Existing history needs a readable exact-linked archive on the thread's machine, not a running Pi process.

New capture needs the installed Tenet Pi extension, an owner policy and recording enabled. The plugin does not activate Tenet, launch Pi, change enforcement, approve actions or supply TypeSafe credentials.

## Install

Local recordings can contain secrets despite redaction. This read-only view is not a protection, approval or confidentiality boundary. Before enabling capture, read [capture and deletion limits](../docs/inspector.md#sensitive-local-storage).

1. Complete the separate [Pi installation](../docs/INSTALL-ARCHIVE.md). Configure the policy and credentials before any real assessed action. Those actions disclose evidence to TypeSafe and use quota; installing this read-only plugin makes no evaluator request.
2. Complete the [locked development setup](../CONTRIBUTING.md#set-up). From the root of a stable Tenet checkout, build and install the plugin:

   ```sh
   bun run plugin:build
   bb plugin install /absolute/path/to/Tenet/bb-plugin-tenet-status
   ```

   Replace the path with this checkout's plugin directory.

3. Start a fresh Pi process with the current extension and recording enabled. Do not set `TENET_RECORDING=off`.
4. Open its BB Pi thread and select **TENET rules** in the header, or **T** on compact viewports.

Only new Pi records with a valid BB-provided `BB_THREAD_ID` link to the thread. This routing hint changes neither Pi session keys nor policy decisions. Historical unlinked records stay in [the standalone inspector](../docs/inspector.md). The plugin never guesses a thread from cwd, time or native session ID.

## Browse from the main Tenet page

After installing the plugin, use this experimental BB navigation path for retained Pi history. A stopped Pi process needs no restart or evaluator credentials for these reads. Its BB thread metadata, machine connection and private archive must still be reachable.

1. Open **TENET** in BB navigation. Choose a project, then a Pi thread. **Next projects** and **Next threads** continue the bounded metadata pages. A thread page can contain no Pi threads; continue if another page is available. Archived threads appear after the ordinary pages.
2. Choose a **Linked session**, a **Finding category** and a call. The main page uses the same summary workspace as the thread tab and standalone inspector. Missing or unlinked history shows unknown, not pass.
3. Use browser **Back** and **Forward** to return to a project, thread, session, category or call selection. BB owns this history. Links contain only bounded scope identifiers and opaque record identifiers, not archive paths, machine selectors or raw payloads.
4. Use **Choose Pi thread** or **Choose project** to change scope. **View flagged rules** opens the existing focused findings route. Old thread findings links still work.

The picker reads BB metadata only; it does not scan project machines or archives. The overview reads only the selected thread's archive through BB's existing environment-to-machine routing. Non-Pi, deleted, unreadable and changed-project selections clear old results and request no unsupported archive.

Picker output contains at most 50 project names or Pi threads per page. Thread reads inspect one 50-row BB metadata window at a time. The current SDK has no project-page API, so the owner RPC pages its project list without requesting included threads.

**Refresh archive** restarts page reads while keeping the main route's session, call and category. Reads use one ten-second polling owner and an eight-second timeout. An unavailable read clears the summary and offers manual refresh.

Reconnect the selected machine or check its owner archive setting before retrying.

Complete live-history retention and recovery remain a later delivery; loaded older pages are not retained across route changes.

## Browse calls beside a conversation

After the separate installation steps above:

1. Open a Pi thread, select **TENET rules**, then **Open thread overview**. BB opens a flush overview tab beside the conversation. Repeating the same open requests focus of the existing tab.
2. Pick a **Linked session**. Use **More sessions** or **More invocations** for older records. Pages contain at most 50 summaries. **Finding category** filters recorded categories; one call can have several categories.
3. Select a call. A narrow panel offers **Calls** and **Summary**, even inside a wide window. The common summary shows call identity, recorded contract metadata, assessment, findings, confidence or approval conditions, recorded decision, Tenet permission and execution separately.
4. Use **Refresh archive** to restart at page one. The panel polls every ten seconds and times out after eight seconds. Unavailable reads clear old results. Reconnect the selected machine or correct its archive setting, then refresh manually. Closing or switching the tab stops its reader and mount.

Evaluator failures use safe reason codes such as `provider-error`. They do not count as selected FAIL or unfinished assessments, even if the tool ran. Archive warnings appear in a separate disclosure and can concern other threads. No record means unknown, not pass.

Recorded rules use 16-rule pages. Open **Why this assessment**, then **Browse all rules**, and use **More rules** to continue. Text over 2,048 characters has an explicit omission marker.

**View flagged rules** retains the focused findings page. Restored non-Pi panel tabs state unsupported and request no archive.

### Inspect raw evidence on the selected machine

BB has no action preview, Evidence or Response view. To inspect those records, use the [standalone inspector instructions](../docs/inspector.md) on the same machine and with the same private archive setting. Keep its loopback listener local to that machine. Opening the BB panel does not start or expose a listener. Raw recordings can contain secrets; do not paste them into BB messages or notifications.

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

The host caches validated metadata. Each refresh shares a 256-stage/16-MiB parse budget across sessions. The overview performs no full detail read per timeline row. It rereads only the selected call, capped at 64 stages / 16 MiB. The separate focused findings RPC retains its five-candidate page and the same per-candidate detail cap.

The host constructs strict allowlisted summaries before serialization. The owner request accepts only a thread ID, opaque linked session/call IDs, a category and scoped cursors. It rejects extra fields, client machine IDs, archive paths and native-session selectors.

Cursors are limited to 512 characters, labels to 256, recorded rule text to 2,048, issue lists to 20 codes, and session/call pages to 50 summaries. Rule pages contain at most 16 rules, including built-in integrity. Summary rules retain recorded thresholds, policy digest and contract versions; they do not read current policy files.

Select a call, open **Why this assessment**, then **Browse all rules**. Use **More rules** for the next page or **First rule page** to return. Page counts identify rules not shown on the current page.

Text over 2,048 characters ends with `[omitted]`; selected rule details show the number of source characters omitted. Missing text and assessed rules without a recorded snapshot are explicit, not passing results.

Rule cursors bind the operation, thread, linked session, call and recorded snapshot. A cursor from a different selection or changed snapshot is rejected. Use **Refresh archive** to restart after rejection.

Schema-3 and schema-4 records keep their recorded contract, selected probabilities, effective thresholds and known gates. WARN, built-in integrity, uncertainty and approval remain distinct. Released permission does not prove execution.

To inspect raw data, open the standalone inspector on the selected thread's machine with the same private archive. Follow the [checkout standalone inspector guide](../docs/inspector.md). A browser-local inspector or another machine's archive is not a substitute. Opening the BB summary starts no listener and adds no Evidence or Response endpoint.

Exact thread association is checked before grouping or counting. A shared native session or resumed Pi session cannot supply another thread's calls. Missing unlinked history remains standalone-only. Policy text renders inertly, but can itself contain secrets. Summary-only access is not a confidentiality boundary against same-user code or an owner client. Raw arguments, command/file previews, submitted evidence, exact questions, provider bodies and error text stay host-local.

## Shared summary build

The checkout includes one Svelte summary composition for the standalone inspector and both BB entry points, mounted through a typed React wrapper. Shared-field placement is the same in both hosts. Standalone action previews and raw inspection remain separate extensions.

Before importing the mount or running its tests, build the ignored `.summary-workspace/` output with `bun run summary:build` from the repository root. `bun run plugin:build` rebuilds that output, then builds the plugin. Building files installs or reloads nothing. A missing or stale shared artifact stops `npm run build` with the required command.

See the [checkout-only summary input, lifecycle and synthetic preview reference](../inspector/summary-workspace.md). Raw evidence stays outside the input. Recorded policy text can itself contain secrets; this is not a confidentiality boundary against same-user code.

## Try the panel offline

From a developer checkout with the locked dependencies installed:

```sh
bun run summary:build
bunx vite bb-plugin-tenet-status --host 127.0.0.1 --port 4174
```

Open `http://127.0.0.1:4174/overview.preview.html?rules` for the rule-focused preview. The synthetic shell keeps a conversation beside the real shared mount and adapter. Try its 390px panel, keyboard navigation, close/reopen and host-disconnect controls.

Browse the pass, selected FAIL, WARN, integrity, approval, uncertainty and provider-failure calls. Open the rule list, continue past 16 rules, and inspect recorded historical thresholds and text omission notices.

This preview reads no archive and makes no evaluator request. It installs or reloads nothing. Without `?rules`, the preview retains the two-call provider-failure scenario.

If the mount is missing or stale, rebuild the summary library before restarting Vite. The preview does not reproduce native BB tab focus or persistence. SDK tests can verify identical open requests, not installed-host focus. Native tab behavior and deployed remote-host reads need separate authorized checks. Full live-history recovery is a later delivery.

### Try the main page offline

With the same checkout-only Vite preview running, open `http://127.0.0.1:4174/main.preview.html`. Choose a project and stopped Pi thread, then a linked session, category and call. Try Back/Forward, the remote-project page, the empty-history thread, rejected-link controls and the 390px container.

Expect separate evaluator failures, selected FAIL findings and archive warnings. The preview uses authored fixtures for two simulated machines and makes no real archive or evaluator request.

Stop the preview with Ctrl+C. To restart it, run the commands in [Try the panel offline](#try-the-panel-offline) again. The synthetic shell models navigation; it does not prove installed BB history, native panels or deployed machine routing.

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
