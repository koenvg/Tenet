# TENET policy guard

A TypeScript POC for Pi 0.85.1. Every exposed tool call follows the same rule-evaluation path through Jev using the official `@typesafe-ai/sdk` 0.6.0. No tool allowlists, tool-family mappings or replacement executors.

**New persistence default:** While TENET is on, it saves submitted assessment evidence locally, including passes. Strings can contain source code or secrets. Set `TENET_RECORDING=off` before starting Pi to opt out, or use `/tenet off` to stop both new assessment and capture. Old records remain. See [Local decision inspector](#local-decision-inspector).

The original KVG-5093 publication slice is extended by configurable policy rules, KVG-5094's bounded recent observations and KVG-5095's invocation-bound approval. No subprocess inspection or OS sandbox.

## Observe first, enforce later

**Breaking default change:** TENET now starts in `observe` mode. It never vetoes calls or requests approval in this mode, even for policy-integrity findings, missing credentials, invalid configuration, timeouts or reporting failures. Host restrictions, cancellation and ordinary tool errors still apply.

Findings are owner-only. The footer shows `TENET OBSERVE`, recent concern/unavailability counts and coverage status. Run `/tenet` to browse up to 100 recent findings, newest first, then select one for rule locations, settings, labels and exact score gates. Older findings are evicted from that view with a count. It uses native scrolling selectors; Escape closes a view. There are no per-call popups.

Observation records what enforcement **would** do separately from actual TENET permission and observed execution. A low-confidence PASS is uncertainty, not a detected violation. An unavailable evaluation is never an all-clear. Findings are not injected into agent messages, tool results or later evaluator evidence, including after recovery. UI-less runs retain non-message session records where possible and write no observation reports to protocol stdout. Owner-only is not a filesystem confidentiality boundary.

Evaluation still happens before execution, with the existing bounded request deadline and latency. If every reporting channel fails, calls remain permitted but reports can be lost. Reporting failures are counted in the footer when it remains available.

To enable blocking later, explicitly start a new process with:

```sh
TENET_MODE=enforce bun run pi --no-extensions
```

`WARN` rules remain advisory in either mode. Only exact `TENET_MODE=enforce` enables enforcement; an invalid value selects observe and reports `invalid-mode`. Mode is fixed for the process. `/tenet off` temporarily bypasses both modes across Pi processes; `/tenet on` restores each process's configured mode without restarting it.

## Verify offline

Use Bun 1.3.14 or newer. The repository pins Bun 1.3.14 and runs the Pi CLI with Bun. The extension also supports Node-hosted Pi on Node.js 22 or newer.

```sh
bun install --frozen-lockfile
bun test
bun run smoke
bun run typecheck
```

Tests use injected judges, clocks and scripted HTTP responses. Offline host tests assert executor calls for concurrent approvals, argument changes, lifecycle transitions, retries and forged consent. The smoke tests exercise the pinned Pi resource loader and tool dispatcher with scripted assistant output and dummy executors. They verify withholding execution, native approval, policy-integrity blocking and executor arguments after an earlier extension mutates them. No credentials or live model calls are required.

The [controlled publication demonstration](eval/publication-demo-README.md) documents opt-in live preflight, denied alternate attempts, separate approvals, independent remote reads and evidence reporting. KVG-5097 has offline coverage only; no live publication is claimed.

These tests verify enforcement mechanics, not semantic accuracy. The saved publication-v3 reports are historical evidence for previous questions. A separate 33-request `policy-rules-v2` live run allowed both reported actions in all repetitions, but still found false blocks and invalid responses. See [eval/README.md](eval/README.md) for the results and limitations.

## Write your policy

Each declaration is one line beginning with the case-sensitive prefix `Rule;` after trimming whitespace. Use `Rule; BLOCK; text` or `Rule; WARN; text`. Legacy `Rule; text` means BLOCK. The rule text is plain text, not code:

```tenet-policy
Rule; BLOCK; Never publish code to a remote repository without explicit approval.
Rule; BLOCK; evidenceThreshold=0.95; Never delete files outside the project directory.
Rule; WARN; evidenceThreshold=0.8; Ask before installing dependencies.
```

Rules are assessed individually. "Never X without approval" can require confirmation, while "Never X" prohibits X outright. A rule that does not apply passes. Among BLOCK rules in enforce mode, a prohibition takes precedence over an approval condition. A WARN rule reports its findings without blocking or opening approval, even when it selects FAIL or APPROVAL_REQUIRED.

The parser is deliberately line-based, not Markdown-aware:

- Headings, blank lines and unmarked prose are ignored, not enforced.
- A `Rule;` line inside a code fence is still active. Do not put illustrative declarations in your active policy unless you intend to enforce them.
- Each rule occupies one physical line. An exact uppercase `BLOCK;` or `WARN;` at the start of the trimmed declaration remainder sets severity. Immediately after explicit severity, optional `evidenceThreshold=<number>;` metadata sets that rule's evidence-confidence threshold. All semicolons after ordinary rule text begins remain literal text. Legacy `Rule; text` is unchanged.
- Duplicate declarations remain separate entries, identified by policy digest and source line.
- The file must be valid UTF-8, at most **64 KiB**, with **1–16 rules**, each at most **4096 UTF-8 bytes** after trimming.
- Empty declarations, no declarations, invalid encoding, exceeded limits or an unavailable file make the entire policy unavailable. TENET never silently truncates the rule set.

The case-sensitive `evidenceThreshold` token is reserved immediately after explicit severity. Values must be unsigned decimal numbers between `0` and `1`, inclusive, with digits on both sides of any decimal point. Whitespace around the key and value is allowed. Empty, signed, exponent, nonfinite or out-of-range values, missing separators, consecutive duplicate settings and empty rule text reject the whole policy. Rephrase older explicit-severity rule text that began with this reserved token. Differently cased keys remain literal rule text, not settings.

Any BLOCK or WARN rule can use this override. Omitted values inherit `TENET_EVIDENCE_THRESHOLD`, default `0.9`; built-in integrity always uses that global value. Outcome confidence remains global, default `0.9`. Lowering evidence confidence does not bypass FAIL, UNKNOWN, INSUFFICIENT or invocation-local approval. These scores are not calibrated safety guarantees.

A loaded sentence is not necessarily assessable. A rule requiring prior tests can still produce UNKNOWN when recent observed calls and results do not establish what ran. Ambiguous rules, omitted history and material redactions produce findings; BLOCK rules can stop execution in enforce mode.

Publication under the example rule includes attempted uploads of source files or Git objects to any remote repository, including private repositories and intermediate uploads before commit creation or reference updates. Local commits and upload preparation without upload are not publication. This rule alone is not a general outbound-data policy.

Under a Git commit prohibition, creating a commit is distinct from reading, editing or staging working-tree files. Saving a README edit is not a Git commit. A sequence that edits and then commits still attempts a commit; other rules and policy integrity apply independently. This is evaluator guidance, not a tool exemption or a guarantee that the judge will classify correctly.

### Owner-only policy management and migration

Agent actions that modify, remove, replace, rename or redirect the active selected policy are assessed against a built-in integrity constraint. In enforce mode it blocks without an approval exception and user rules cannot weaken it. In observe mode it reports without vetoing. The constraint covers the selected path and resolved target, including evidenced aliases and parent-directory replacement.

**Edit your active policy yourself, outside the intercepted agent path.** Do not ask the guarded agent to migrate or weaken it. Existing unprefixed publication prose is no longer accepted, and TENET will not rewrite it for you.

For the original policy, replace the unprefixed sentence with:

```tenet-policy
Rule; Never publish code to a remote repository without explicit approval.
```

The bundled `TENET.md` uses `evidenceThreshold=0.8` for its email rule. Publication and commit rules omit overrides and inherit the global default of `0.9`, as does integrity. Unprefixed files report `policy-format`; observation permits calls with unavailable coverage, while enforcement blocks until migrated.

Before release, TENET checks that policy bytes and the resolved target still match the loaded snapshot. A mismatch or read failure latches `policy-stale` until session-start reload or restart. Observation keeps permitting calls but reports unavailable coverage; enforcement blocks. Changes while confirmation is open do not authorize the pending action.

This is semantic protection, not filesystem isolation. Jev can misclassify an action, hidden aliases may be unknown, and TENET cannot freeze the filesystem between checking and execution or stop activity outside its hooks.

To roll back this change, restore the previous extension and legacy `Rule; text` policy syntax externally, then restart. Older versions ignore `TENET_MODE`, do not understand WARN/BLOCK metadata, and block by default. Rollback does not preserve observation mode.

Before rolling back per-rule threshold support, remove threshold metadata from deployed policies. Older versions treat that segment as rule prose, not configuration. After removal, all rules use the global evidence threshold.

## Enable in Pi

1. Review and, if necessary, migrate the selected policy externally as above.
2. Set `TYPESAFE_API_KEY` using your normal secret-management method. Never put secrets in policy text or the repository.
3. Start the pinned Pi process with only this explicitly selected extension:

   ```sh
   bun run pi --no-extensions
   ```

   The package script adds `-e ./src/pi/extension.ts`. Explicit extensions still load with `--no-extensions`.

4. Check the footer for `TENET ON OBSERVE` or the explicitly configured `TENET ON ENFORCE`. If the global choice is off, it shows `TENET OFF` instead. Startup identifies policy source, SHA-256, count and question version. Missing credentials or invalid policy/configuration report unavailable; they only block in enforce mode. An extension load error means TENET did not load.
5. You can try reading a local file. This makes a live judge request, unlike the offline tests.

Code or environment changes require a **full Pi process restart**. Under Pi 0.85.1 and Bun 1.3.14, `/reload` and `/new` can retain old module imports. Policy-file-only changes can use the session-start reload path; check the new digest and count.

Loading the extension enables observation by default, not protection. Unloading it removes observation and enforcement. There is no live-mode mock fallback. Use `bun run smoke` rather than a real upload to test approval safely.

## Use TENET across Pi projects

Install the package from a stable checkout, not a disposable worktree. A local Pi package stays at the path you give it; Pi does not copy it. Its `package.json` loads `src/pi/extension.ts`. Keep its dependencies installed and restart Pi after changing extension code.

```sh
TENET_DIR=/absolute/path/to/stable/Tenet
cd "$TENET_DIR"
bun install --frozen-lockfile
pi install "$TENET_DIR"       # user-level package; do not add -l
pi list
```

In each shell that will launch Pi, set `TYPESAFE_API_KEY` with your secret manager. Set `TENET_POLICY` to an absolute path to a reviewed policy when working outside this repository. Otherwise Pi looks for `TENET.md` in **each session's working directory**; global installation does not provide one. If you want an initial trial without local capture, set `TENET_RECORDING=off` before launching Pi. Then start plain `pi` from any project. Do not also load this extension with `-e` or `bun run pi`, which can load two guard copies.

In the Pi owner UI, run `/tenet status` before a live tool call. It shows `TENET ON OBSERVE`, `TENET ON ENFORCE`, `TENET OFF`, or `TENET CONTROL UNAVAILABLE`, the base mode, policy readiness and effective capture state. Bare `/tenet` still opens the findings view. `/tenet off` persists a machine-wide choice at `~/.tenet/control.json`, skips new assessments, approvals, trajectory capture and recording, and keeps the extension and commands available. `/tenet on` restores each process's existing `TENET_MODE` and `TENET_RECORDING` settings. Both commands are safe to repeat. Missing policy, credentials or invalid configuration on re-enable still follows that mode's usual unavailable behavior. The control file defaults to on when no choice exists. A corrupt or unreadable control file shows `CONTROL UNAVAILABLE`: enforce blocks and observe permits without assessing or recording. Repair a safe malformed file with `/tenet on` or `/tenet off`; fix unsafe permissions or symlinks outside Pi.

The issuing process cancels its pending assessments before `/tenet off` reports success. Other running Pi processes observe the shared file through notifications and a short refresh loop, then cancel their pending work. **The command does not wait for them.** A call in another process might complete before it notices off; work already released or dispatched cannot be recalled. Every new guard entry and pending release rechecks the file, but a change between the final check and host dispatch can still race. Treat this as a cooperative same-user switch, not an OS security boundary. An agent or process with your filesystem permissions can change or remove the control file; removing it lets fresh processes start on. Pending archive writes can finish after off, and previous recordings in `~/.tenet/recordings` remain until you remove them separately.

The offline tests cover shared-file propagation in a separate process and two guard instances, plus the pinned Pi dispatcher in one process. They do not establish live multi-process Pi behavior with TypeSafe credentials; no global package install or live tool trial was performed for this change.

To remove global loading, run `pi remove "$TENET_DIR"` with the same stable path you installed and restart Pi. Removing the package does not remove the control file or old evidence. Older TENET versions ignore the control file; if you roll back, unload the extension or use that version's startup controls before launching Pi. This switch applies only to TENET's Pi extension, not other agent hosts.

## Enforcement decisions and approval

The following blocking and approval behavior applies only in enforce mode. Observe mode reports the counterfactual decision without vetoes or prompts.

One bounded Jev request contains outcome and evidence-sufficiency questions for each user rule plus integrity. Settings do not change semantic assessment. TENET validates the complete response and applies deterministic aggregation to BLOCK rules and integrity; WARN findings are owner-only and do not vote in that aggregation:

| Results | Decision |
| --- | --- |
| Every BLOCK rule and integrity constraint confidently PASS | ALLOW; WARN findings remain advisory |
| At least one BLOCK rule APPROVAL_REQUIRED, other blocking rules confidently PASS | ASK |
| Any BLOCK rule or integrity FAIL | BLOCK; no approval override |
| Any blocking rule UNKNOWN, low probability or insufficient evidence | BLOCK |
| Configuration, credential, provider, response, deadline or cancellation failure | BLOCK |

No majority vote or averaging across rules. Model probabilities are experimental signals, not calibrated correctness guarantees.

ASK shows one native confirmation listing all approval-requiring rules, their source lines, policy digest, session/tool/call identity, original-argument digest and field-redacted arguments. Only an explicit positive response releases that unchanged pending invocation. Denial, dismissal, missing UI, UI failure, cancellation and timeout block. Chat, task text and historical approval entries are never permission. Approval cannot authorize a later call, another tool, a retry or the entire session.

TENET serializes its native dialogs. The approval timeout defaults to 60 seconds and includes time waiting in the queue. Queued calls are checked again before their dialog opens. Cancellation signals the native UI and blocks the invocation immediately. If the UI ignores cancellation, TENET keeps the dialog slot occupied until that UI promise settles; later calls can time out without opening a dialog. A late answer cannot approve another invocation.

Session-start reload, session shutdown, switch/fork/tree lifecycle hooks and agent end invalidate pending work, including outstanding judge requests. Session and policy identity are checked again before release. A detected policy change invalidates all pending calls and latches the guard unavailable until reload. Even a cancelled branch or switch attempt discards existing approvals; a fresh call must be assessed again.

### Read a block diagnostic

Both probability thresholds still default to 0.90. A selected FAIL always blocks, even below that threshold. A passing label can also block when its score is too low:

```text
TENET blocked: insufficient-evidence. Rules: line 4.
line 4: outcome-confidence-below-threshold; outcome=PASS p=0.88 threshold=0.9; evidence=SUFFICIENT p(SUFFICIENT)=0.93 threshold=0.9
```

The aggregate reason is retained for compatibility. The detail identifies the actual gate: here evidence is sufficient and only outcome confidence is below threshold. Each blocking rule lists all triggered gates: `rule-fail`, `outcome-unknown`, `outcome-confidence-below-threshold`, `evidence-insufficient`, and `evidence-confidence-below-threshold`. Scores equal to the threshold pass that gate. Evidence probability always means P(SUFFICIENT), even when the selected label is INSUFFICIENT.

Details contain bounded rule locations, validated labels and numeric scores, not action arguments or provider explanations. Failed or invalid assessments have no invented rule scores. A new debug flag or raw request log is not required.

## Configuration

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `TENET_MODE` | `observe` | `observe` never vetoes; exact `enforce` enables blocking. Restart to switch. Invalid values warn and observe. |
| `TENET_POLICY` | `TENET.md` | Absolute path or path relative to session cwd |
| `TENET_EFFECT_THRESHOLD` | `0.90` | Minimum selected per-rule outcome probability; retained name |
| `TENET_EVIDENCE_THRESHOLD` | `0.90` | Minimum sufficient-evidence probability for every rule |
| `TENET_JUDGE_DEADLINE_MS` | `2500` | Overall judge deadline, not per-rule; human approval time is separate |
| `TENET_APPROVAL_TIMEOUT_MS` | `60000` | Approval deadline including queue time; integer from 1 through 2147483647 |
| `TENET_RECENT_EVENTS` | `12` | Maximum recent observations; nonnegative integer, zero omits all history |
| `TENET_EVIDENCE_MAX_BYTES` | `24576` | Maximum UTF-8 bytes of serialized judge state; positive integer |
| `TENET_SENSITIVE_FIELDS` | `[]` | JSON array of additional field names to remove recursively |
| `TYPESAFE_API_KEY` | none | Required TypeSafe credential |

Example: `TENET_SENSITIVE_FIELDS='["customerSecret","internalPayload"]'`. Field matching ignores case, hyphens, underscores and whitespace. Explicit empty or malformed configuration is not a request to disable protection.

Retries are disabled. Cancellation reaches the SDK, and a late response cannot change a blocked decision. Requests use `jev-latest`, which is a provider alias rather than an immutable release. Audit entries retain requested and returned model identities. SDK logging is disabled and the destination is the official TypeSafe endpoint.

## Local decision inspector

TENET records assessments by default in `~/.tenet/recordings`, independently of whether the inspector is running. `TENET_RECORDING_DIR=/absolute/path` selects another archive. Paths must be absolute and have no symlink components. Existing archive directories must be owner-only; unsafe paths disable writes rather than being repaired silently. Recording settings are separate from enforcement settings.

```sh
bun install --frozen-lockfile
bun inspector
```

`bun inspector` starts the inspector with Vite live reloading for local development. For the standalone production build, run:

```sh
bun run inspector:build
bun run inspector:serve
```

Run these commands from the repository root with Bun 1.3.14 or newer. Keep `inspector/dist` beside `src` after building. Production launch serves those built assets, not Vite, and requires neither Pi nor `TYPESAFE_API_KEY`. Stop it with Ctrl+C. Rebuild after frontend changes.

From an active Pi session, build the frontend once, then run `/tenet-inspector`. The command starts the same read-only server on demand, prints a URL selecting the current session, and asks macOS to open it in Arc. A session with no recorded calls yet shows a waiting state; other projects and sessions remain in the picker. Repeating the command uses the same listener. Pi closes its listener on session exit, switch, fork, or reload; invoke the command again after resuming. If Arc is unavailable or fails to open, Pi leaves the URL visible for manual use and does not open another browser. If the build is missing or invalid, run `bun run inspector:build` and retry. The independent `bun run inspector:serve` command remains available after Pi exits. Neither launch asks the evaluator to reassess anything.

To browse a non-default archive, use the same absolute directory configured for the Pi writer:

```sh
TENET_RECORDING_DIR=/absolute/private/archive bun run inspector:serve
```

You can leave the inspector closed while Pi records. Open it later, select the retained session and call, then inspect each rule's contribution, questions, evidence and response. Resume that same Pi session to see new calls and stages arrive through polling. A fork creates a different session. The inspector cannot approve, retry, execute tools, edit policy or call a provider.

Open the printed loopback URL in Arc. The Pi command attempts this automatically, while standalone users can open its URL manually. The production server chooses an available port. The Vite development server and Vite preview try `http://127.0.0.1:52320/` first, then successive ports if occupied. Neither launch uses authentication or a token. Plain URLs and reloads work directly. Any local process can read the archive, including evidence that may contain secrets. Loopback binding, Host/Origin checks and read-only routing remain enabled.

Choose a session, an invocation, then a rule. The view shows the recorded policy, actual application-level questions and choices, bounded/redacted submitted state, SDK response, validation and deterministic decision. All rules, including passing rules and built-in integrity, are selectable. Evidence and response text are inert. Mode, would-decision, permission and observed execution are separate. Missing stages stay unknown; a released call is not proof of execution.

The standalone server reads the archive without Pi or evaluator credentials. Close Pi, then run the same inspector command to inspect retained assessments. Filter by the exact project directory, using the suggested paths or entering a path. Newly recorded project paths are canonical working directories, not Git remote groupings; older records retain their captured paths. Resumes add calls to the original session; forks have separate session IDs.

Session summaries show start/update times, call and concern counts, unavailable decisions and best-effort coverage. Lists show 50 items at a time. Sessions and calls sort newest-started first, so resumed activity does not move the session across an existing page boundary. Use **More sessions** or **More invocations** to continue. Loading more calls preserves the selected detail. Copy the address-bar URL to link to a session or invocation; it contains hashed IDs, never evidence. Browser back/forward restores selection, including calls beyond the first page.

The inspector polls every two seconds, preserving project filters, loaded pages and selected detail. Refresh sessions or the timeline manually to check sooner. The reader builds a metadata-only index, parsing at most 256 new or changed stage files and 16 MiB per refresh. Cold indexing must read existing stage envelopes once, then discards their evidence. Unchanged files are not reread on subsequent summary refreshes. An indexing notice means more records remain to discover; subsequent refreshes continue indexing. On-demand detail reads only the selected invocation, capped at 64 stages and 16 MiB, with an explicit issue when capped. Corrupt or unsafe files remain visible as archive issues.

### Sensitive local storage

Submitted strings may contain secrets despite field redaction. Capture preserves the exact submitted application payload; it does not reconstruct omitted history or record transport headers/API configuration credentials. SDK response snapshots are untrusted, have a 1 MiB limit and explicit truncation markers. Their byte counts describe serialized content after credential/header field omissions. Snapshots reject error instances, accessors, custom serialization, more than 100,000 values or nesting deeper than 64 levels and show an unavailable marker instead. Records have a 4 MiB limit. Oversized or unserializable records are dropped and counted, never silently labeled exact.

Directories use mode `0700`, files `0600`. This is unencrypted owner-restricted storage, not protection against an agent or another process running as that owner. Archive content and capture-health reports are not added to Pi messages, tool output or evaluator history. Existing safe Pi custom records retain their separate format.

The asynchronous queue allows 64 pending records and 16 MiB total. Capture failures do not change enforcement, approval or permission. Owner UI shows the archive location, loss/pending counters and drain timeouts. Normal shutdown drains for up to one second. On storage recovery, a reserved health write records cumulative writer-wide failure, dropped-stage and drain-timeout counts without competing for queue space. Counts can span sessions and must not be summed across snapshots from the same writer. If storage never recovers or the process exits first, health may only reach the owner's live UI.

The inspector distinguishes safe provider failures, invalid responses, requests not submitted and incomplete assessments. Missing responses or tool results stay unknown. Corrupt, unsupported, unsafe/unreadable and temporary stage files appear as separate recording issues without blocking valid records. Temporary files are not read; they may be in progress or left after an interruption. A crash, full disk or exhausted queue can leave incomplete history. Records are best-effort diagnostics, not a transactional audit log.

To disable new capture without changing mode:

```sh
TENET_RECORDING=off bun run pi --no-extensions
```

Disabling capture does not delete old files. There is no automatic expiry. After stopping all Pi writers and the inspector, remove the archive directory yourself to delete retained evidence. For the default location, that directory is `~/.tenet/recordings`. Existing pre-feature Pi session files are not imported.

Additional offline verification:

```sh
bun run inspector:check
bun run inspector:test
bun test test/standalone-workflow.test.ts
bun run inspector:test:browser
```

The UI test builds the production Svelte client and exercises it in a DOM against the local server, using scripted SDK transport and persisted pass, concern and failure records. It restarts the reader and checks incomplete history, truncation, unavailable responses, recording issues and capture health. It makes no live provider calls.

The integrated workflow test records passes, concerns and provider failure with the reader closed, restarts the reader, resumes the same session and compares historical questions and evidence with the scripted SDK payload. It checks live permission and execution stages separately. The browser suite connects only to the owner's existing Arc debugging endpoint at `http://127.0.0.1:9222`, or `TENET_BROWSER_CDP_URL`. A connection failure blocks browser verification; DOM checks are not a visual substitute.

## Data disclosure and audit

TypeSafe receives declared rule text, policy identity/paths, the host working directory, the built-in integrity constraint and a copied action snapshot: tool name, available description/schema, field-redacted arguments, identities, timestamp, original-argument digest and limitations. Bounded chronological observations include earlier calls, text or structured results, decisions and native approval outcomes. Every observation carries session/call/tool identity, host origin and timestamp, with explicit missing-metadata markers.

The pending action is kept intact. Older observations are omitted first to fit the event and byte budgets, with omission counts. If required judge state cannot fit, evaluation reports insufficient evidence without asking Jev. That is a veto only in enforce mode. Image content is marked unsupported, never converted into invented text. Conflicting and outdated observations remain within the budget for assessment.

At session start and after re-enabling TENET, it restores bounded observations from the selected Pi branch. Native tool calls and results are replayed only when their call ID has a matching TENET permission record in the same session. Off-state and otherwise unassessed transcript content is excluded, with a trajectory limitation marker. Only enforcement decision/approval records enter evaluator history; observation findings are excluded live and on recovery. The owner view separately restores validated version-3 permission records from the selected branch. Recovered history and tool-supplied content remain untrusted evidence, never grants. Later sibling results cannot alter an in-flight assessment. TENET calls no tools to gather missing context.

Recognized credential fields and configured sensitive fields are removed recursively from copied evidence. Executor arguments remain unchanged. Redaction cannot find all secrets embedded in shell commands, source text, URLs, metadata or encoded values. Rule text itself is not secret-scanned. Do not place credentials in your rules.

Version-3 `tenet` custom records include mode and distinguish:

- `status`: readiness, policy snapshot, rule count, version and configuration.
- `assessment`: per-rule outcomes and probabilities, model, duration and limitations.
- `decision`: ALLOW/ASK/BLOCK, reason, contributing rule IDs, question version and per-rule `diagnostics` with gates, labels, scores and thresholds. Older records can lack the added fields; their assessment and configuration remain available.
- `approval`: native UI outcome and applicable rules.
- `permission`: actual TENET release/block, counterfactual `wouldDecision`, assessment availability, reasons, safe rule references and findings. Released does not mean executed.
- `execution`: observed Pi tool result, executed or failed; unobserved outcomes remain unknown.

Version-2 records and historical evaluation reports retain their original enforcement meaning. They are not reclassified as observation results.
Each intercepted invocation receives an `invocationId`, separate from the host's call ID. Assessment, decision, approval, permission and execution records retain that identity with session, tool, call, policy digest and assessed original-argument digest. ALLOW is not human approval, and neither ALLOW nor positive approval is proof of execution. Released invocations without a result become `unknown` at agent end or lifecycle invalidation. A failed result does not prove the action had no remote effect. A retry requires a new host call ID, fresh assessment and any required approval. Duplicate host IDs invalidate pending work rather than ambiguously associating a result.

Records omit raw arguments, tool schemas, payloads, results and unsolicited provider prose/errors. Policy declarations are part of startup records. Pi's own transcript and other extensions have separate logging behavior. A successful tool result does not independently verify remote effects. After a crash that prevents final logging, absence of a result still must not be interpreted as success.

## Host contract and remaining limits

Pi must expose every agent tool call before execution, await and honor blocks, and execute the assessed arguments without later mutation. Load TENET after all argument-mutating `tool_call` extensions and register its handler after mutators within the same extension. The pinned Pi smoke test checks this ordering with an earlier mutating extension and compares both the assessed snapshot and executor payload with the expected post-mutation arguments.

TENET rechecks arguments, cancellation, session identity and policy before returning permission. The host must prevent subsequent mutation, honor cancellation before dispatch, supply unique tool-call IDs within each session and deliver lifecycle events before replacing or tearing down the runtime. Later hooks, retained argument references, tool preparation and executors must not change the assessed action after permission. Metadata must describe the actual executor. This is an integration contract, not a frozen-argument or protected-executor mechanism.

TENET does not observe subprocess internals, user-entered `!` commands, extension-internal execution or background tool activity. It does not fetch script contents or browse target systems. Opaque actions can block. A confident but mistaken judge can still allow a prohibited action.

Concurrent approval and lifecycle behavior have offline contract coverage. Adversarial live evaluation and remote-state verification remain separate work. The integrity check is not a tamper-resistant production boundary. The trajectory questions have offline contract coverage, not live semantic validation.

## Independent decision entry

`src/decision/decide.ts` imports no Pi code. Call `decide({ policy, action, cwd, judge, ... })` with a loaded policy set, captured action and trusted host working directory. Offline callers inject a scripted `Judge`; deadline tests can inject a `Clock`. `createJevJudge` uses TypeSafe and makes live calls when invoked with credentials. ALLOW and ASK are decisions for the caller to enforce, not execution commands. Pi owns the policy freshness checks and native confirmation.

hello
