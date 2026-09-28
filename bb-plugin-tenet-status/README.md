# TENET status in BB

## Install

TENET must already be active in Pi, with a policy and recording enabled. The BB plugin only reads recordings. It does not activate TENET, launch Pi, change enforcement or supply TypeSafe credentials.

From a stable TENET checkout:

```sh
bb plugin build bb-plugin-tenet-status
bb plugin install /absolute/path/to/Tenet/bb-plugin-tenet-status
```

Install the TENET Pi extension separately. Do not set `TENET_RECORDING=off`. Only new Pi records with a valid BB-provided `BB_THREAD_ID` link to a thread. Restart older Pi processes with the current extension and recording enabled. Historical unlinked recordings remain in the standalone TENET inspector; the plugin never guesses their thread from a session ID or working directory.

## Read status

Open a Pi thread and select **TENET rules** in its header, or **T** on compact viewports. This neutral action is always available on Pi threads. A compact count appears only for validated recorded selected FAIL calls, including WARN and built-in integrity. No passing-call badge, toast, transcript message or agent tool is installed.

The header polls every ten seconds while mounted, even with the popover closed. **View flagged rules** opens the selected thread's findings. Each row shows the rule, loaded-call count and an **Uncertain** marker when needed. Expand a rule to see call IDs, confidence and its policy snapshot. Repeated calls group by recorded rule ID and policy snapshot, not today's policy text. WARN and built-in integrity remain distinct. Low-confidence FAIL stays a finding, not a confirmed breach.

A short incomplete-coverage warning stays visible. Approval conditions and recording gaps appear in a compact disclosure; the underlying counts, UNKNOWN, evidence/confidence gates and incomplete-assessment explanations are available inside. These are not labeled rule failures.

The details page also polls every ten seconds without navigating away from the selected thread. Group counts cover loaded calls only. Use **Load more findings** for older calls. Once older pages are loaded, live reads check availability but leave those calls in place; **Refresh findings** explicitly restarts at page one with updated calls. Failed reads clear previous results and show unavailable; rejected cursors offer a page-one refresh. Reads time out after eight seconds. Closing or switching the view disposes its timers and ignores late results.

## Machines and custom archives

Reads run on the selected Pi thread's actual BB machine, resolved from its environment. The default is `~/.tenet/recordings` on that machine, not on the BB server. The machine must be enrolled and connected. No local fallback is used for a disconnected host.

If TENET uses `TENET_RECORDING_DIR`, configure the same absolute path per machine in the owner's BB plugin settings:

```sh
bb plugin config tenet-status set recordingDirectories '{"host_abcdefgh1234":"/home/me/tenet-recordings"}'
bb plugin config tenet-status
```

Use `bb machine list` to find machine IDs. The plugin does not read the Pi process's environment, so it cannot discover a custom path automatically. Paths must be normalized, absolute and private to the current host user; symlinks are rejected. Missing, unreadable or disconnected archives report unavailable. An existing readable archive with no linked records reports unknown, never clear.

## Limits and privacy

A flag is the judge's recorded selected FAIL, not proof of blocking or execution. Counterfactual BLOCK, approval requirements and gates without FAIL do not count as findings. Coverage is always incomplete: recordings can be absent, disabled, dropped or still being indexed. Neither a released call nor no recorded failures proves safety.

The host caches validated metadata. Each refresh bounds scanning and shares a 256-stage/16-MiB parse budget across sessions. Large archives may need several refreshes. The owner detail RPC pages at five candidate calls, re-reading at most 64 stages / 16 MiB per candidate. Rule groups only cover loaded pages. The UI reports missing stages, writer loss and indexing gaps.

Summary RPCs contain counts and bounded coverage codes, not rule text or action strings. Details contain selected rule text, a policy-snapshot hash and allowlisted call/classification fields. Raw submitted evidence, action arguments and provider responses stay on the host. Policy text renders as escaped text. Removing the plugin does not stop TENET or delete recordings.

## Validation

```sh
bun test bb-plugin-tenet-status
cd bb-plugin-tenet-status
npx vitest run --config vitest.config.ts
npx tsc --noEmit
cd ..
bun test
bun run typecheck
bb plugin build bb-plugin-tenet-status
```

`live-status.test.ts` exercises archive writes through the host and owner RPC contracts with separate local/remote machine identities and custom paths, new records, disconnects and archive loss. This is a simulated routing integration test, not proof of a deployed remote daemon. A release check should repeat the workflow on an enrolled remote host and inspect the compact UI in BB.
