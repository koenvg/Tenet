# Read Tenet status in BB

Use this plugin to read recorded Pi findings in a BB thread. It does not activate Tenet, launch Pi, change enforcement, approve actions or supply TypeSafe credentials. It needs a stable developer checkout, an installed Tenet Pi extension, an owner policy and recording enabled.

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

The host caches validated metadata. Every refresh bounds scanning and shares a 256-stage/16-MiB parse budget across sessions. Owner detail RPC pages at five candidate calls and rereads at most 64 stages / 16 MiB per candidate. Rule groups cover loaded pages only. UI reports missing stages, writer loss and indexing gaps.

Summary RPCs return counts and bounded coverage codes, not rule text or action strings. Details return selected rule text, a policy-snapshot hash and allowlisted call/classification fields. Policy text renders as escaped text. Raw submitted evidence, arguments and provider responses stay on the host.

## Shared summary build

The checkout includes a typed React mount for the shared Svelte summary workspace. It does not register an overview page or thread panel yet. The existing flagged-rule views remain active.

Before importing the mount or running its tests, build the ignored `.summary-workspace/` output with `bun run summary:build` from the repository root. `bun run plugin:build` rebuilds that output, then builds the plugin. Building files installs or reloads nothing. A missing or stale shared artifact stops `npm run build` with the required command.

See the [checkout-only summary input, lifecycle and synthetic preview reference](../inspector/summary-workspace.md). Raw evidence stays outside the input. Recorded policy text can itself contain secrets; this is not a confidentiality boundary against same-user code.

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
