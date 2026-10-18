# Inspect findings and recordings

Use this guide to open Tenet's local inspector, select a session and rule, and read retained evidence. It covers Pi 1.3.0 and standalone use from a developer checkout or the production archive. The inspector is read-only. It cannot approve, retry or execute tools, edit policy, or ask a provider to reassess a call.

- If Pi is running, [open the inspector from Pi](#open-it-from-pi).
- To read retained files without Pi, [start the standalone inspector](#open-it-without-pi).
- Once it is open, [select a session, rule and recorded action](#select-a-session-and-call).
- For missing calls or old reader code, use [the status fixes](#no-calls-or-stale-reader-status-appear).

## Before you open the inspector

Recordings can contain secrets in submitted source, commands and other strings despite field redaction. The server has no authentication or token. Do not expose or proxy it to another machine. Any local process with the owner's access can read this unencrypted archive.

Capture is on by default in `~/.tenet/recordings`, whether the inspector is running or not. `TENET_RECORDING=off` disables new local capture, not provider disclosure, observation or native findings. Old files remain. See [capture, retention and deletion](#sensitive-local-storage).

Opening retained evidence is offline and makes no evaluator request. Real assessments send policy, paths and selected evidence to the selected service. Official TypeSafe uses quota. Custom hosted System One costs depend on its operator.

Kev or APUS through owner-operated forwarding sends these strings to Pika. The owner controls Pika logging, access and retention. Capture-off stops neither provider disclosure nor provider and backend logs.

Before a live action, read [what the selected judge receives](limits.md#data-disclosure-and-audit). There is no live mock fallback.

Before a live-capable Pi launch or activation, obtain separate authorization for the selected service and exact full policy and selected evidence. Before starting either inspector service, obtain separate authorization to expose retained full policy and selected evidence to same-user loopback readers. Opening the inspector makes no new judge request.

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
4. If Arc is unavailable or fails to open, use the printed URL yourself. Pi does not open a different browser. Use **Session** to choose another session. To narrow projects, use **Recording issues and archive controls**.

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

## Monitor local Operations

For Pi, SDK and Claude bridge activity, select **Operations** in the standalone app. Use the same selected recording directory as the runtime.

This page reads local snapshots offline. It makes no provider request and has no approval controls. BB summaries remain separate.

1. Select a project and a **Timing window** of 15 minutes or one hour.
2. Select a count or state filter to find work. Search matches retained tool names, host names, project labels and invocation IDs. **Overview** shows a table. **Queue board** groups the current page by state.
3. Select a request to read its independent assessment, permission and tool-result facts. Preparing and Finalizing are real intermediate states, not permission to run.
4. If **Open in Inspector** is available, select it for the exact recording, including calls beyond the first archive page. Close the Inspector's recorded-action panel, then select **Operations** in the top workspace navigation to return to the dashboard. Escape closes request details and restores focus.
5. Open **Coverage and retention** to check publication freshness, sample counts, omitted metadata, telemetry loss, archive loss and reader limits.

Queued means observe work waiting for an observation slot. Analyzing begins at `decide()`, not slot reservation. Enforce bypasses that queue and shows **Not queued**.

Observe can release permission while its assessment is still queued or analyzing. Awaiting approval refers to the bounded attempt in the host, not a guaranteed visible dialog. Finalizing still needs permission commitment and freshness checks.

Current activity counts ignore the timing window. Completed and outcome counts use assessment completion within the selected window.

Average and nearest-rank P95 analysis use all eligible retained returned `decide().durationMs` values, including unavailable results with a measured duration. Cancelled work without a returned duration is not a timing sample.

Queue averages use actual observe slot reservations, not cancelled or expired waiting residence. Empty chart intervals are gaps. These measurements are neither isolated provider latency nor end-to-end tool latency.

Recent publications establish only activity from observed runtimes. Stale, missing, malformed, unsupported or unreadable snapshots cannot establish current totals. **Unknown** is not zero.

Partial counts do not include omitted work. Browser freshness expires independently of HTTP completion and is checked again when the tab resumes. A successful HTTP response does not establish provider connectivity or complete machine coverage.

### Operations storage and limits

Operations has one private atomic snapshot per SDK resource owner or Claude bridge, shared across its project runtimes. It is not a replay journal.

After its first eligible activation, the owner keeps publishing even between sessions. Ending a session interrupts its unfinished assessment but does not close the owner or its active siblings. Only guard or bridge disposal publishes Closed and stops the writer; activation off uses Suspended instead.

It uses `.operations-v1` inside the selected recording directory, with `0700` directories and `0600` files. Unsafe paths and files are rejected, not repaired.

Recording off, invalid recording configuration, an external recording callback, dormant sessions and initially inactive activation create no Operations files or heartbeat.

Turning activation off clears published activity to a payload-free suspended marker and stops heartbeats. Reactivation starts a new coverage interval. This does not change recording, enforcement or approval contracts.

Snapshots contain bounded lifecycle facts, timings, opaque project keys and safe identity projections. They do not copy arguments, commands, source, policy, credentials or error text.

Descriptions come only from the existing private archive preview after an exact indexed-address match. Those archive previews can still contain secrets. Missing, withheld, not-yet-indexed and budget-limited recordings remain explicit.

| Bound | Limit |
| --- | --- |
| Projects per owner | 64 |
| Active request details per owner | 256 |
| Settled requests per owner | 1,024, for at most one hour |
| Encoded request row | 2,048 bytes |
| Encoded snapshot | 1 MiB |
| Normal publication cadence | At most once per second; heartbeat every two seconds |
| Cached runtime documents | 16; bounded refresh work every two seconds |
| Snapshot read concurrency and bytes | Four reads at once, at most 16 MiB per refresh |
| Discovery | 64 directory entries per refresh with a retained cursor |
| Publication freshness | Ten seconds |
| Returned request page | At most 100 rows |
| Exact archive-description index | 8,192 stage references, at most 32 per invocation; 100 lookups per page |

Settled rows are evicted before active details when the byte budget is reached. Omitted active work makes totals partial.

The reader shares its 16-file read budget between round-robin cached refreshes and newly discovered candidates. It retains at most 64 candidate names. At full cache capacity, up to four candidate reads leave at least 12 cached refreshes per pass.

Fresh active owners take priority over fresh idle owners, then closed, suspended, invalid or expired owners. Replacement reports `history-omitted`; skipped reads report `reader-budget`. These limits can omit retained history and make counts partial.

Publication failures preserve the previous atomic file and appear in counters after a later successful write. A crash leaves last-known facts that expire, not invented terminal outcomes. Clean shutdown marks owned unfinished activity Interrupted.

A running owner can remove valid telemetry snapshots older than 24 hours in bounded passes. This never removes recordings. There is no hard machine-wide disk bound under arbitrary process churn, and no cleanup without a running owner.

Recording files still have no automatic expiry.

If current activity is unknown, check local recording and activation settings, runtime version, private-path permissions and the displayed coverage issues. An older runtime does not publish Operations snapshots. Do not treat an empty dashboard as proof that no tools are running.

Use the offline checks below for implementation validation, not proof of active host hooks.

## Shared summaries and standalone evidence

The standalone Inspector starts with native session and rule navigation. The BB overview entry points use the shared summary workspace and are built and installed separately; see [the BB overview guide](../bb-plugin-tenet-status/README.md). BB's summary input excludes raw arguments, action previews, submitted evidence, exact questions and provider response bodies.

The standalone inspector retains private recorded-action detail and its existing links. Shared summary code neither exposes nor proxies its loopback listener. Rule text renders as inert text, but recorded policy text can still contain secrets. Same-user access limits remain unchanged.

For checkout-only library builds and a synthetic source preview, use the [shared summary developer reference](../inspector/summary-workspace.md). These commands do not install or reload the BB plugin.

## Select a session and call

1. Open **Session** above **Did this session follow the rules?** Choose a session by its project name and start time. Each option shows its recorded status and unchecked-rule count, or **Rule inventory unknown**.
2. Under **Rules in this session**, select a rule. The **Rule details** panel shows its full recorded wording, status and **Recorded checks**. Open **Recorded version and origin** for its captured declaration and policy identity.
3. Read a check's status and reason. Open **Recorded check context** for its profile, question and input versions, outcome, gates and call ID when recorded.
4. Open **View recorded action** beneath that check. The action detail names Tenet permission, Tool result and Assessment separately. It also shows the submitted action, recorded mode, applicable findings, recorded approval when available and one brief reason.
5. Open **Why this assessment** for compact recorded rule text and confidence bars, with findings before passing rules. Each reading names the selected score and recorded threshold. Evidence confidence uses SUFFICIENT, separately from a different selected evidence probability.
6. Open **Recorded data** for submitted action fields, captured policy and exact technical records.
7. Open **Exact rule records and captured questions** to inspect every retained reader rule record and captured question. Read permission and tool result separately from the assessment.

This one JSON destination retains full rule text, identity, source line, severity, owner/integrity marker, outcome and evidence choices, contribution, complete distributions, recorded thresholds, gates, mappings, question objects and question version. It remains available when the application response is missing, unavailable or truncated.

Use Tab to reach the native disclosure, then Enter or Space to open it. Tab reaches its scrollable exact-data region. Questions are JSON data, not formatted Markdown. HTML, links and images remain inert.

Missing scores, thresholds and gate coverage stay missing. Non-applicable evidence has no invented score. A selected evidence probability remains separate from SUFFICIENT in the recorded distribution. Model probabilities are not calibrated safety guarantees.

A recorded confidence gate with PASS is uncertainty, not a selected violation. WARN gates are advisory. Approval conditions remain separate from permission and tool results. The inspector never compares against current policy settings.

**Why this assessment** keeps compact recorded-rule text and confidence bars. Question shortcuts, readable question sections, the repeated PASS confidence note, separate Rule outcome rows and **Probabilities and rule details** are absent. Use **Recorded data** for the complete exact records.

Open **Recorded data**, then **Recording and coverage**, to read the recorded implementation, requested and returned aliases, judge report version, origin, transport, authentication mode and configuration provenance. BB's shared detail shows the same bounded facts under **Recorded judge**. Neither view consults current settings.

V1 `typesafe` keeps its historical meaning. V1 and absent destinations, transport and authentication stay **not recorded**. Injected or unknown v2 identity stays **unknown**.

Failed or unfinished assessment has no complete returned model, even if another stage carries a conflicting completed alias. Origins are inert text, not destination links or proof of physical weights.

For APUS, open **Recorded data**, then **Recording and coverage** and **Native scoring mappings**. Read captured letter/token mappings and deterministic NONE selectors separately from model probabilities.

Open **Recorded data**, then **Application response and validation** and **Recorded native exchanges** for every bounded snapshot and omission marker, not just the final backend reply. Partial exchanges never establish a complete returned assessment.

Evidence and response text are inert. The inspector never reevaluates policy or invents model reasoning.

**No violations found** covers only recorded checks, not every action in the session. **Violation found** does not establish permission, approval or execution. **Unclear** is neither a violation nor a pass. **Not checked** does not mean followed, violated or not applicable.

Select **Close** or press Escape to return to the rule list. Focus returns to the rule that opened the panel.

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

Open **Recording issues and archive controls** below the rule list to narrow the session picker. Enter an exact path in **Project directory**, then select **Filter projects**. Select **All projects** to remove that filter.

New paths are canonical working directories, not Git remote groups. Older records retain their captured paths. There is no call-list or finding-category filter in this rule view.

Sessions load 50 at a time and sort newest-started first. Resuming adds calls to the original session without moving it across an existing page boundary. Forks have separate session IDs.

Use the pagination control for the list you are reading:

- **More sessions** in the **Session** picker adds older sessions.
- **More rules** below **Rules in this session** adds rules.
- **More recorded checks** inside **Rule details** adds checks without closing the panel.

Copy the address-bar URL to share the selected session, rule or recorded action with another reader of the same private archive. It contains hashed IDs, not evidence. Browser back/forward restores selection.

A direct recorded-action link can open a call beyond the first page without browsing every earlier check. Missing rule inventory remains explicit; the reader does not invent a rule association.

Recorded action detail shows a submitted command or file path when available. It checks string arguments in this order: `command`, `path`, `file_path`, and skips empty or non-string values. It does not infer an action from the tool name or read current files.

If no preview string is usable, the detail says **Command or file path not recorded. See Recorded data for submitted arguments.**

The private archive index keeps whitespace-normalized previews of at most 512 UTF-8 bytes without splitting characters. Shortening a preview is not capture loss. Open **View recorded action**, then **Recorded data**, for the full captured argument with its original whitespace. These are submitted strings, not resolved targets or proof that a tool ran.

Previews can contain secrets. They remain in the private inspector and do not enter links, logs, BB thread status, agent context or evaluator inputs.

On narrow screens, use the same **Session** picker and rule list. Selecting a rule opens a full-width **Rule details** panel. Scroll inside it for more checks and recorded action data.

Select **Close** or press Escape to return to the rule list. There is no separate mobile call-list switch.

## Check fresh stages and partial coverage

The inspector polls every two seconds. It preserves the project filter, loaded pages and open recorded action data. Use **Refresh archive** inside **Recording issues and archive controls** to check sooner. Resume the same Pi session to see new checks and stages.

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

Judge fields come only from recorded data. `judge-report-v2` adds canonical origin, transport and auth mode without changing archive schema 5 or semantic contracts. Historical `judge-report-v1` and APUS native versions retain their meanings. Missing fields stay not recorded; the reader never uses today's settings to rebuild prompts or label old providers. See [the recorded native contract](assessment-contract.md#native-recording-contract).

Unsupported newer records and corrupt files produce a short Partial archive indicator. Indexing archive means indexing is still in progress. Supported calls remain readable.

One short archive-state line stays visible below the rule list, including on narrow screens and when the list is empty. Close an open rule or recorded-action panel to return to it. **Coverage unknown** is not known incompleteness. **Supported records** identifies the reader's supported subset, not a complete audit.

Healthy reader metadata stays in **Recording issues and archive controls**, without a recording warning.

Open **Recording issues and archive controls** for exact unsupported/newer/corrupt/other counters, indexing state, reader build and supported schemas, individual file issues, and per-writer capture counters. Writer counters are cumulative, not per call, and may cover other sessions. Zero counters do not prove complete capture.

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

On Linux CI, install Chromium system libraries with `bunx playwright install --with-deps chromium`. Success means the checks exit zero. These tests need no Arc debugging endpoint, signed-in profile, evaluator credential or live provider call. See [inspector test instructions](../inspector/tests/README.md) for focused component, journey and infrastructure commands and setup fixes.

Vitest Browser Mode component tests mount React views with controlled API responses. The Playwright Test journey lane builds and serves the production client from a temporary loopback archive in disposable headless Chromium. It checks updates, pagination, deep links, failure history, truncation and capture health, and blocks non-local browser requests.

The integrated workflow records passes, concerns and provider failure with the reader closed, restarts it, resumes the same session, and compares recorded questions/evidence with the scripted SDK payload. It checks permission separately from execution. Offline success does not prove live model accuracy or deployed hook coverage.
