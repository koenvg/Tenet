# Inspect findings and recordings

Use this guide to open Tenet's local inspector, select a session and call, and read retained evidence. It covers Pi 1.1.0 and standalone use from a developer checkout or the production archive. The inspector is read-only. It cannot approve, retry or execute tools, edit policy, or ask a provider to reassess a call.

- If Pi is running, [open the inspector from Pi](#open-it-from-pi).
- To read retained files without Pi, [start the standalone inspector](#open-it-without-pi).
- Once it is open, [select a session and call](#select-a-session-and-call).
- For missing calls or old reader code, use [the status fixes](#no-calls-or-stale-reader-status-appear).

## Before you open the inspector

Recordings can contain secrets in submitted source, commands and other strings despite field redaction. The server has no authentication or token. Do not expose or proxy it to another machine. Any local process with the owner's access can read this unencrypted archive.

Capture is on by default in `~/.tenet/recordings`, whether the inspector is running or not. `TENET_RECORDING=off` disables new local capture, not provider disclosure, observation or native findings. Old files remain. See [capture, retention and deletion](#sensitive-local-storage).

Opening retained evidence is offline and makes no evaluator request. Real assessed Pi actions contact the selected judge. TypeSafe uses quota; APUS sends full native rendering to the owner-operated backend, including Pika through forwarding. Before authorizing such an action, read [what the selected judge receives](limits.md#data-disclosure-and-audit). There is no live mock fallback.

## Open it from Pi

First complete the [archive installation](INSTALL-ARCHIVE.md) or [development setup](../CONTRIBUTING.md#set-up). Do not load a registered Tenet package a second time with `-e`.

1. Start a fresh Pi process in an eligible project with an owner-authored policy. For an installed archive, run from that project:

   ```sh
   TENET_MODE=observe pi
   ```

   For a developer checkout with dependencies installed, run from the repository root:

   ```sh
   bun run inspector:build
   TENET_MODE=observe bun run pi --no-extensions
   ```

   The archive already has built assets. The checkout's `pi` script builds the SDK and explicitly loads `src/pi/extension.ts`, even with `--no-extensions`.

2. Check `TENET ON OBSERVE` and run `/tenet status`. If the shared choice is off, `/tenet on` restores this process's configured mode. It does not select enforcement or activate a dormant session.
3. Enter `/tenet-inspector`. Pi starts the local server, prints a URL selecting the current session, and attempts to open Arc on macOS.
4. If Arc is unavailable or fails to open, use the printed URL yourself. Pi does not open a different browser. Select another project or session from the picker if needed.

A session with no recorded calls shows a waiting state. Repeating `/tenet-inspector` reuses the listener. Pi closes it on session exit, switch, fork or reload. Invoke the command again after resuming. A standalone listener remains available after Pi exits.

Observation never vetoes a call or opens approval, even when a finding says it would block. Host restrictions, cancellation and tool errors still apply. For enforcement and its one-call approval limits, see [decisions and approval](limits.md#enforcement-decisions-and-approval).

## Open it without Pi

These supported standalone paths read retained files offline. They need neither Pi nor `TYPESAFE_API_KEY`.

1. For an installed production archive, set `TENET_DIR` to its stable directory and run:

   ```sh
   TENET_DIR=/absolute/path/to/tenet
   cd "$TENET_DIR"
   npm run inspector:serve
   ```

   Replace the path with your installation. Its production dependencies must already be installed. No compiler or frontend build is needed.

   For a developer checkout with frozen dependencies installed, run from the repository root with Bun 1.3.14+:

   ```sh
   bun run inspector:build
   bun run inspector:serve
   ```

   Keep `inspector/dist` beside `src`. This serves built assets, not Vite.

2. Open the printed loopback URL in Arc. The production server chooses an available port.
3. Stop the server with Ctrl+C when finished.

For a custom archive, use the same absolute private path as the writer. From a checkout:

```sh
TENET_RECORDING_DIR=/absolute/private/archive bun run inspector:serve
```

For an installed archive, use `npm run inspector:serve` with the same variable. Paths must have no symlink components. Existing archive directories must be owner-only. Unsafe paths disable writes rather than being silently repaired.

For local frontend development only, `bun inspector` starts Vite with live reloading from the repository root. Vite development and preview try `http://127.0.0.1:52320/`, then successive ports if occupied. Both development and production retain loopback binding, Host/Origin checks and read-only routing. Plain URLs and reloads work without a token.

## Shared summaries and standalone evidence

The standalone Inspector and both BB overview entry points use one React workspace layout. The standalone reader adds private call rows and recorded-data disclosures through internal render slots. The BB plugin keeps its safe summary presentation and is built and installed separately; see [the BB overview guide](../bb-plugin-tenet-status/README.md). Its summary input excludes raw arguments, action previews, submitted evidence, exact questions and provider response bodies.

The standalone inspector retains those detail views and its existing links. Sharing presentation neither exposes nor proxies its loopback listener. Rule text renders as inert text, but recorded policy text can still contain secrets. Same-user access limits remain unchanged.

For checkout-only library builds and a synthetic source preview, use the [shared summary developer reference](../inspector/summary-workspace.md). These commands do not install or reload the BB plugin.

## Select a session and call

1. Open **Session / archive** to choose a project and session, read the read-only explanation or reader build/schema metadata, or use **Refresh archive**. For the project filter, choose a suggested directory or enter its exact path. New paths are canonical working directories, not Git remote groups. Older records retain their captured paths.
2. Select a session, then an invocation. The first view names Tenet permission, Tool result and Assessment separately. It also shows the action, recorded mode, applicable findings, recorded approval when available and one brief reason.
3. Open **Why this assessment** for compact recorded rule text and confidence bars, with findings before passing rules. Each reading names the selected score and recorded threshold; evidence confidence uses SUFFICIENT, separately from a different selected evidence probability.
4. Open **Recorded data** for submitted action fields, captured policy and exact technical records.
5. Open **Exact rule records and captured questions** to inspect every retained reader rule record and captured question. Read permission and tool result separately from the assessment.

This one JSON destination retains full rule text, identity, source line, severity, owner/integrity marker, outcome and evidence choices, contribution, complete distributions, recorded thresholds, gates, mappings, question objects and question version. It remains available when the application response is missing, unavailable or truncated.

Use Tab to reach the native disclosure, then Enter or Space to open it. Tab reaches its scrollable exact-data region. Questions are JSON data, not formatted Markdown. HTML, links and images remain inert.

Missing scores, thresholds and gate coverage stay missing. Non-applicable evidence has no invented score. A selected evidence probability remains separate from SUFFICIENT in the recorded distribution. Model probabilities are not calibrated safety guarantees.

A recorded confidence gate with PASS is uncertainty, not a selected violation. WARN gates are advisory. Approval conditions remain separate from permission and tool results. The inspector never compares against current policy settings.

**Why this assessment** keeps compact recorded-rule text and confidence bars. Question shortcuts, readable question sections, the repeated PASS confidence note, separate Rule outcome rows and **Probabilities and rule details** are absent. Use **Recorded data** for the complete exact records.

For APUS, open **Recorded data**, then **Recording and coverage** and **Native scoring mappings**. Read captured letter/token mappings and deterministic NONE selectors separately from model probabilities.

Open **Recorded data**, then **Application response and validation** and **Recorded native exchanges** for every bounded snapshot and omission marker, not just the final backend reply. Partial exchanges never establish a complete returned assessment.

Evidence and response text are inert. The inspector never reevaluates policy or invents model reasoning.

### Read submitted and exact data

Recorded data starts with the submitted action and captured policy. Submitted path, command and before/after edit text keep their original strings. They describe a submitted proposal, not an executed filesystem change. Arbitrary fields stay inert. Missing or malformed arguments have an unavailable readable view and retain the captured action JSON.

Use these native disclosures for the technical records:

- **Exact submitted action JSON** retains the complete captured action.
- **Policy identity and exact JSON** retains policy source, target, digest and rules when recorded.
- **Exact submitted evidence** contains every state section, chronological history, reference values pools, redaction and omission markers. It does not reconstruct references or omitted content.
- **Exact rule records and captured questions** retains every reader rule record, original question objects, choices, keys, rule references, mappings and captured question version in one JSON disclosure. It does not depend on response availability or current templates.
- **Application response and validation** keeps the SDK response and validation fields. Truncated responses retain their preview and original serialized byte count after field omissions. Unavailable snapshots remain explicit.
- **Recording and coverage** contains lifecycle, approval, permission, execution, failure, identifiers, schemas, adapter coverage, profile, durations, missing stages and interpretation limits. **Exact runtime evidence context JSON** retains coverage metadata and loss counts separately from submitted evidence.

The view preserves open disclosures, exact-data nodes, focus and evidence scroll through unchanged polls and delayed stages. Exact JSON retains recorded numeric precision. No control runs a tool, reads a current file, reassesses a call or grants approval.

```text
captured action + policy + bounded evidence
                    |
              recorded assessment
                    |
          recorded policy decision
          "would block" in observe

actual Tenet permission       execution record
released or withheld          executed, failed or unknown
```

The finding describes the assessment. Permission describes whether Tenet released the call. Execution records describe observed outcomes only when the host supports exact result correlation; these facts do not prove an external effect.

Read the named facts this way:

| Field | Meaning |
| --- | --- |
| Tenet permission: Not blocked by Tenet | Recorded `released` permission. Tenet let the host proceed; this does not prove dispatch, execution, approval or a passing assessment. |
| Tenet permission: Blocked by Tenet | Actual recorded block, including an unexpected block in observe mode. It does not certify prevention on every host path. |
| Tenet permission: Unknown | No known permission fact. An ALLOW decision or approval cannot supply it. |
| Tool result: Successful or Failed | A correlated result was recorded, separate from policy findings. Failure does not prove that there were no external effects. |
| Tool result: Unknown / not recorded | No known correlated result. Released permission and approval are not results. |
| Assessment | The recorded decision or lifecycle status. Observe BLOCK/ASK says would block or would ask in enforce mode. It is not actual prevention or requested approval. |

Contradictory blocked permission and a tool result show both facts with an inconsistency warning. Pending, dropped, cancelled, incomplete, invalid and unavailable assessments are never a policy all-clear. Their status appears once in Assessment, not as repeated badges. All independent violation, uncertainty and approval findings remain visible; capture-loss notices remain separate.

Current SDK-backed Pi execution remains `unknown` even when a native result reports success or failure. Pi lacks exact result correlation. Historical recorded `executed` and `failed` outcomes retain their meanings.

For example, an observe-mode PASS with `p=0.88` can fail the default `0.9` outcome gate while evidence is SUFFICIENT at `0.93`. It reports uncertainty and would block in enforce mode, not a selected violation. Observe still releases the call. With no captured result, execution remains unknown. See [exact gates and validation](limits.md#read-a-block-diagnostic).

A selected FAIL is a suspected violation, not proof that Tenet blocked or that the tool ran. Missing, pending, dropped, cancelled, invalid or unavailable assessment is not a pass. Coverage gaps and UNKNOWN/INSUFFICIENT outcomes are separate facts. Stock Pi and Claude do not supply authenticated action resolution, and Tenet is not a sandbox.

## Browse more calls and share a link

Session summaries show start/update times, call and concern counts, unavailable assessments and best-effort coverage. Lists contain 50 items per page and sort newest-started first. Resuming adds calls to the original session without moving it across an existing page boundary. Forks have separate session IDs.

Call rows show a recorded command or file path when available. The reader checks string arguments in this order: `command`, `path`, `file_path`. It skips empty or non-string values. If none is usable, the row says **Action preview unavailable**. It does not infer an action from the tool name or read current files.

The display copy normalizes whitespace and keeps at most 512 UTF-8 bytes without splitting characters. **Preview shortened** marks a longer value, not capture loss. Select the call and open **Recorded data** to read the full captured argument, with its original whitespace. These are submitted strings, not resolved targets or proof that a tool ran.

Previews can contain secrets. They remain in the private inspector and do not enter links, logs, BB thread status, agent context or evaluator inputs.

Common mode, Not blocked by Tenet and absent-result wording may appear above the list only when every displayed call records that fact. This is context for displayed calls, not a claim about the full session or archive. Filtering, loading more calls and new stages recalculate it. Blocks, failures, mixed or unknown modes, invalid assessments and incomplete or conflicting records keep individual cues.

Use **More sessions** inside **Session / archive** or **More invocations** below the call list to continue. Loading more calls preserves the selected detail. Copy the address-bar URL for a session or invocation link. It contains hashed IDs, not evidence. Browser back/forward restores selection, including calls beyond page one.

Commands and file paths lead each call row. Tool names, times and separate recorded facts follow. The native **Finding category** select is always visible above the loaded call list in Calls.

Use **Finding category** to filter suspected violations, uncertainty, approval conditions, evaluator failures or pending/incomplete observations. There is no filter accordion. The native select keeps its accessible label and keyboard selection. Counts are distinct calls; categories can overlap. BLOCK alone is not a violation. An active category and **Clear filter** stay visible, including when no calls match.

There is no Repeated uncertainty section or replacement group view. The UI does not request groups. Public reader/group APIs and their recorded facts remain unchanged.

On narrow screens, use **Calls** and **Selected call**. Calls retains the complete loaded list, direct filter and pagination. Selecting an individual call opens Selected call; Calls returns to the list. There is no Summary/Patterns switch.

## Check fresh stages and partial coverage

The inspector polls every two seconds. It preserves project filters, loaded pages and selected detail. Use Refresh archive inside Session / archive to check sooner. Resume the same Pi session to see new calls and stages.

The metadata-only index has these per-refresh limits:

| Work | Limit |
| --- | --- |
| Root directory entries | 128 |
| Session directory entries | 512 |
| New or changed stage files parsed | 256 |
| Parsed bytes | 16 MiB |
| Selected invocation detail | 64 stages and 16 MiB |

Cold indexing reads each stage envelope once, keeps only bounded action previews, up to 16 policy-rule excerpts plus integrity, and other allowlisted metadata, then discards full evidence. Later sweeps recheck cached files without rereading unchanged evidence. Large archives can take several polls to show changes, deletions, corrupt files or unsafe files. An indexing notice means the sweep or parsing is incomplete. A capped detail read reports an explicit issue.

New writes use schema 5 and `policy-sources-v1`. The reader preserves schemas 1 through 4, their submitted payloads, singular identities and recorded thresholds. A rule's source role, configured path, target and digest come from its record.

A missing historical role says unknown, not recorded. Readers never consult current policy files. Missing historical diagnostics say **Not recorded**.

Pending or dropped assessments have no invented would-decision or final history counters. Unsupported newer records, corrupt files and incomplete indexing produce a partial-coverage warning even while supported calls remain readable.

Provider/model fields come only from recorded data. APUS's additive native recording contract leaves schema 4 unchanged. Missing historical fields stay not recorded; the reader never uses today's settings to rebuild native prompts or label old providers. See [the recorded native contract](assessment-contract.md#native-recording-contract).

Unsupported newer records and corrupt files produce a short Partial archive indicator. Indexing archive means indexing is still in progress. Supported calls remain readable.

One short archive-state line stays visible outside Session / archive and in both mobile views, including empty lists. **Coverage unknown** is not known incompleteness. **Supported records** identifies the reader's supported subset, not a complete audit.

Healthy reader metadata stays in Session / archive, without a recording warning.

Open **Recording issues** for exact unsupported/newer/corrupt/other counters, indexing state, reader build and supported schemas, individual file issues, and per-writer capture counters. Writer counters are cumulative, not per call, and may cover other sessions. Zero counters do not prove complete capture.

The disclosure scrolls if needed. Paused/reconnecting updates and other live alerts remain separate and visible.

Recording issues also gives reader update guidance. For an updated checkout reader, rebuild and restart the process; rebuilding alone leaves the old listener running. Archive owners replace the installation and restart.

See [evidence provenance and historical interpretation](inspection-evidence.md#recorded-and-inspector-explanations) and [host/session attribution](cross-host-recordings.md). Incomplete archives are unknown, never passes.

## Sensitive local storage

Capture preserves the exact submitted application payload. It does not reconstruct omitted history or record transport headers/API configuration credentials. Strings may still contain secrets. Recognized credential fields and configured sensitive fields are removed from copied evidence; executor arguments do not change. Rule text is not secret-scanned.

| Capture limit | Exact behavior |
| --- | --- |
| SDK/native response snapshot | 1 MiB, with explicit truncation markers |
| Response traversal | Reject error instances, accessors, custom serialization, more than 100,000 values or depth greater than 64; show unavailable instead |
| Record | 4 MiB; oversized or unserializable records are dropped and counted |
| Asynchronous writer queue | 64 pending records and 16 MiB total |
| Normal shutdown drain | Up to one second |

Response byte counts measure serialized content after credential/header field omissions. A dropped or truncated record is never silently labeled exact. Directories use `0700`; files use `0600`. Storage is unencrypted and owner-restricted, not a confidentiality boundary against the agent or another same-user process.

Native APUS requests and responses use the same bounded snapshot path. Sanitization also omits fields named `token`; it does not remove submitted tokenizer IDs in `prompt` or `labelIds`.

These snapshots are not an unredacted wire log. Native metadata, timing and cache counters cannot prove calibration, physical weights or authenticated coverage.

Capture failures do not change enforcement, approval or permission. Owner UI shows archive location, pending/loss counters and drain timeouts. On storage recovery, a reserved health write records cumulative writer-wide failure, dropped-stage and drain-timeout counts without using queue space. These counts can span sessions. Do not sum repeated snapshots from one writer. If storage never recovers or the process exits first, health may reach only live owner UI.

The inspector distinguishes safe provider failures, invalid responses, requests not submitted and incomplete assessments. Corrupt, unsupported, unsafe/unreadable and temporary stage files appear as separate issues without blocking valid files. Temporary files are not read; they may be in progress or left after interruption. A crash, full disk or exhausted queue can leave stages missing. This is best-effort diagnostics, not a transactional audit log.

Archive content and capture-health reports do not enter Pi messages, tool output or evaluator history. Safe Pi custom records have their own format. Pi's own transcript and other extensions have separate logging behavior. Pre-feature Pi session files are not imported into this archive.

### Stop new capture

Set `TENET_RECORDING=off` before launching Pi. For a checkout, from the repository root:

```sh
TENET_RECORDING=off bun run pi --no-extensions
```

For an installed archive, set the same variable before `pi`. This does not change mode, prevent provider disclosure or delete old files. `/tenet off` is different: it cooperatively skips new assessment, approvals, trajectory capture and recording. Pending writes can finish after off. See [owner control limits](limits.md#owner-control-is-not-isolation).

### Delete retained evidence

There is no automatic expiry. Stop all Pi writers and inspector readers first. Then remove the archive directory yourself, using your file manager or owner shell. The default is `~/.tenet/recordings`; verify any custom `TENET_RECORDING_DIR` before deleting it.

Deletion removes retained evidence. Turning capture off or uninstalling Tenet does not. Pi session files and `~/.tenet/control.json` are separate and remain unless removed separately.

## No calls or stale reader status appear

- No Tenet footer or commands can mean a dormant policy-free project or an extension load error. Run the offline [doctor](doctor.md) outside Pi. Registration alone supplies no policy.
- A malformed policy, missing explicit path or missing credential means unavailable assessment. Repair the policy outside the guarded agent path or configure the secret securely, then restart. Observe permits; enforce blocks. Neither is a pass.
- No new archive can mean capture is off, the shared choice is off, a dormant session, unsafe storage, writer loss or interruption. Check `/tenet status` and coverage notices. Native findings can exist without local capture.
- Missing or invalid frontend assets in a checkout require `bun run inspector:build`. After any reader/frontend update, rebuild **and restart** the standalone server or the Pi process that launched it. Rebuilding alone leaves old reader code and in-memory assets running. Archive owners replace the installation and restart; they do not need a build.
- A Partial archive indicator for unsupported schemas means only the supported subset is visible. Check the displayed reader build identity and supported schemas. Old links resolve without archive migration. Do not rewrite records for an older reader.

## Verify the inspector offline

Developer checkout only. Use installed frozen dependencies, Bun 1.3.14+ and Node 22.19+ or 24 for the pinned Pi checks. Use the [isolated validation shell](../CONTRIBUTING.md#check-a-change). From the repository root:

```sh
bunx playwright install chromium
bun run sdk:build
bun run summary:build
bun run inspector:check
CI=1 bun run inspector:test
bun test test/standalone-workflow.test.ts
```

On Linux CI, install Chromium system libraries with `bunx playwright install --with-deps chromium`. Success means the checks exit zero. These tests need no Arc debugging endpoint, signed-in profile, evaluator credential or live provider call. See [inspector test instructions](../inspector/tests/README.md) for focused component/browser commands and setup fixes.

Component tests mount React views with controlled API responses. The full-app suite builds and serves the production client from a temporary loopback archive in disposable headless Chromium. It checks updates, pagination, deep links, failure history, truncation and capture health, and blocks non-local browser requests.

The integrated workflow records passes, concerns and provider failure with the reader closed, restarts it, resumes the same session, and compares recorded questions/evidence with the scripted SDK payload. It checks permission separately from execution. Offline success does not prove live model accuracy or deployed hook coverage.
