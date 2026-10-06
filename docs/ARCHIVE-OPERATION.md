# Operate the archive installation

Use this guide to check status, manage policy and settings, and fix an installed production archive. Follow the [root installation guide](../README.md) first. In a checkout, the archive recipe is [available in the repository](https://github.com/koenvg/Tenet/blob/main/docs/INSTALL-ARCHIVE.md).

Start with [status](#check-status-before-a-live-action). Then choose the branch you need:

- [Turn assessment and capture on or off](#use-the-cooperative-onoff-switch).
- [Write rules](#write-one-line-rules) or [change an active policy](#owner-only-policy-management).
- [Enable enforcement and native approval](#observation-and-enforcement).
- [Look up settings](#settings-before-launch) or [fix a failure](#troubleshooting).
- [Inspect or delete retained evidence](#disclosure-and-limits).

Pi loads `dist/pi/extension.js`, which registers the native guard and inspector command. The guard uses the same compiled SDK as standalone consumers. No global `tenet` command is installed.

## Check status before a live action

A real assessment sends full policy, paths, selected tool evidence and bounded observations to the selected judge. TypeSafe uses quota; APUS through private SSH forwarding sends these to Pika and uses CPU. Secrets can survive field redaction.

Default local capture saves submitted strings in `~/.tenet/recordings`. `TENET_RECORDING=off` stops neither disclosure nor all backend logs; the owner controls backend log access/retention.

Observe never vetoes or opens approval, including for unavailable assessment or integrity findings. Tenet is not an OS sandbox. Pi cannot freeze arguments after hook release or inspect subprocesses. Pi installation does not verify the Claude Code prototype.

1. From your project, run the offline doctor in the same shell environment as your next Pi launch. Replace both placeholders:

   ```sh
   TENET_DIR=/absolute/path/to/tenet
   cd /absolute/path/to/project
   node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD"
   ```

   Doctor sends no evidence and changes no files. `ready` means local readiness, not credential validity, provider connectivity or active hooks. See [doctor states and exits](doctor.md#states-and-exits).

   Before live-capable launch or evidence submission, obtain separate authorization for the exact full policy/selected evidence and selected TypeSafe or Pika service. Secrets can survive redaction. Expect quota/CPU cost, default capture and owner-controlled backend logs; capture-off stops neither disclosure nor all logs.

   A launch approval does not authorize evidence submission or deployment changes.

2. Start a fresh Pi process from the project with explicit mode selection:

   ```sh
   cd /absolute/path/to/project
   TENET_MODE=observe pi
   ```

3. In an eligible session, run `/tenet status`. It shows base mode, activation, policy readiness, effective capture and declared host coverage.
4. Use bare `/tenet` to browse owner findings. A finding describes an assessment, not permission or proof that a tool ran.

Expected active status is `TENET ON OBSERVE`, or `TENET ON ENFORCE` after an explicit enforce launch. A shared off choice shows `TENET OFF`; unavailable control shows `TENET CONTROL UNAVAILABLE`.

A fresh dormant extension has no Tenet footer, notifications or commands. An extension load error means Tenet did not load.

In pinned Pi 0.85.1, a switch from eligible to dormant can leave old command names listed until a full native extension reload. Retained handlers stay silent while dormant or transitioning, and old source, digest, readiness and footer state are cleared. The supported API has no command unregister or hide operation. Listed names do not prove active enforcement. Code or environment changes still need a full process restart.

## Eligibility and owner control

### Select a policy

Tenet selects optional `~/.tenet/TENET.md` from the process owner's home alongside `TENET.md` in the session working directory. `TENET_POLICY` replaces only the project candidate with an absolute or session-relative file. There is no global-path override, per-project opt-out, parent search or installation-directory fallback. No owner policy ships in the archive. A prompt attachment does not activate the guard.

```text
Owner home global + session project -> validate complete set
Both implicit candidates absent, no override -> dormant
Valid set -> assess every declaration, global then project
Invalid set -> observe permits without a pass; enforce blocks
```

A global-only session is eligible. Any present empty, malformed, unreadable or over-limit source invalidates the whole set. A missing explicit project file, blank override or uncertain filesystem state is unavailable, not global-only fallback.

Missing credentials or invalid guard configuration also makes active assessment unavailable. Broken links are not absence. Deletion or appearance of a selected source after activation invalidates the whole snapshot rather than making it dormant.

A dormant session has no assessment, veto, approval, recording or Tenet UI. A file appearing later needs a new session or extension reload. `/tenet on` cannot activate a dormant session.

#### Migrate from TENET_POLICY

Use this optional procedure to switch from an external project file to the session directory's `TENET.md`. Keep the selected policy in place until the replacement is ready.

Before these policy/owner-file changes, obtain separate authorization. Future assessments disclose the full changed policy and selected evidence to TypeSafe or Pika, with secrets possible despite redaction, quota/CPU cost, default capture and backend logs. Capture-off stops neither disclosure nor all logs. Manage policy externally; do not ask the guarded agent to change it.

1. Review the intended policy yourself and place it at `TENET.md` in each session working directory, outside the guarded agent's intercepted path. Tenet does not copy or create the file.
2. Remove `TENET_POLICY` from the environment that launches Pi.
3. Run the offline doctor for the project as shown above. Check its selected local source, digest and rule count, and resolve invalid setup.
4. Restart Pi and verify `/tenet status` before separately authorized live work.

Setting `TENET_POLICY` again selects that project source on restart and leaves global selected. Empty values are invalid, not an opt-out. Older releases may ignore overrides or global discovery and cannot reproduce additive enforcement. Before rollback, review a complete policy selected for each project using the target version's supported selection, then verify doctor and native status. Keep the new release if you cannot preserve the required rules. Existing recordings remain unchanged.

### Write one-line rules

Before writing owner policy, obtain separate authorization. Future assessments send full policy and selected evidence to TypeSafe or Pika, with possible secrets despite redaction, quota/CPU cost, default capture and backend logs. Capture-off stops neither disclosure nor all logs.

The optional global file activates projects without local rules. Its rules and paths can reach the selected judge and local recordings, and an invalid global file makes the complete set unavailable. Review these effects before creating it yourself at `~/.tenet/TENET.md`.

Tenet never creates an owner policy automatically.

Author policy yourself outside the guarded agent's intercepted path. This example is illustrative, not complete protection:

```tenet-policy
Rule; Ask before overwriting owner-demo.txt.
```

This is the supported short form, with default severity `BLOCK`. Explicit `BLOCK` is optional. Check the selected source, SHA-256 digest and rule count with doctor before launching. This example has `1` declared rule, excluding built-in integrity.

#### Choose severity and metadata when needed

Use `WARN` for advisory findings only. Metadata lets you set a per-rule evidence-confidence threshold:

```tenet-policy
Rule; WARN; evidenceThreshold=0.8; Ask before installing dependencies.
```

| Declaration form | Meaning |
| --- | --- |
| `Rule; text` | Supported short form, default severity `BLOCK` |
| `Rule; BLOCK; text` | Explicit blocking rule |
| `Rule; WARN; text` | Advisory rule |
| `Rule; BLOCK; evidenceThreshold=0.95; text` | Blocking rule with its own evidence-confidence threshold |

After trimming whitespace, each declaration starts with case-sensitive `Rule;` and occupies one physical line. Exact uppercase `BLOCK;` or `WARN;` at the start of the trimmed remainder selects explicit severity. Other text remains rule prose with default blocking severity.

#### Check parser rules and limits

Headings, blank lines and ordinary prose are ignored. A declaration inside a Markdown fence is still active. After ordinary rule text starts, semicolons remain literal text. Duplicate declarations remain separate entries, identified by source role, file SHA-256 and physical line.

| Limit | Requirement |
| --- | --- |
| Encoding | Valid UTF-8 |
| Combined file bytes | At most 64 KiB, or 65536 bytes |
| Combined user declarations | 1 through 16 |
| Rule text | At most 4096 UTF-8 bytes after severity/metadata removal and trimming |

Both sources share these budgets. Each present source needs at least one declaration. Equal declarations or one target selected in both roles count twice.

The count excludes built-in integrity. Empty declarations, no declarations, invalid encoding, exceeded limits or an unavailable regular-file target reject the whole policy. Tenet never silently truncates the rules.

Current snapshots use `policy-sources-v1`. Status and doctor show each source's role, configured path, resolved target and file digest, plus the versioned combined digest and total rule count.

Current rule IDs are `role:fileSHA256:physicalLine`. Global declarations precede project declarations. Project permissions, severity or thresholds cannot cancel or weaken global declarations.

New archives use schema 5. Schemas 1 through 4 retain their recorded singular identities and thresholds. An absent historical role stays unknown. Readers use recorded sources, not current files, and never rewrite archives for an older reader.

#### Set a per-rule threshold

Immediately after explicit severity, optional case-sensitive `evidenceThreshold=<number>;` sets that rule's evidence-confidence threshold. Use unsigned decimal numbers from `0` through `1`, inclusive, with digits on both sides of a decimal point. Whitespace around the key and value is allowed.

Empty, signed, exponent, nonfinite or out-of-range values, missing separators, consecutive duplicate settings and empty rule text reject the whole policy. Differently cased keys remain literal text. The short form `Rule; text` has no metadata parsing. Rephrase older explicit-severity prose that begins with reserved `evidenceThreshold`.

Any `BLOCK` or `WARN` rule can override evidence confidence. Omitted values inherit `TENET_EVIDENCE_THRESHOLD`, default `0.9`. Integrity always uses that global value.

Outcome confidence remains global, default `0.9`. Lowering evidence confidence does not bypass `FAIL`, `UNKNOWN`, `INSUFFICIENT` or one-call approval. Scores are not calibrated safety guarantees.

"Never X without approval" can require confirmation; "Never X" prohibits X. A blocking prohibition takes precedence over an approval condition. `WARN` never blocks or opens approval, even for `FAIL` or `APPROVAL_REQUIRED`. A loaded sentence is not necessarily assessable, such as a prior-tests rule with no evidence of what ran.

### Owner-only policy management

Before changing or rolling back owner policy, obtain separate authorization. Future assessments disclose full policy and selected evidence to TypeSafe or Pika, with possible secrets despite redaction, quota/CPU cost, default capture and backend logs. Capture-off stops neither disclosure nor all logs.

Do not ask the guarded agent to create, migrate or weaken its active policy. Edit it yourself in an editor or owner shell outside the intercepted path.

Built-in integrity covers modifying, removing, replacing, renaming or redirecting every selected source, resolved target and absent selected candidate, including evidenced aliases and parent-directory replacement. Reading policy is permitted. In enforce mode, integrity blocks without an approval exception and user rules cannot weaken it. Observe reports without vetoing.

Unprefixed policy prose is no longer accepted. To migrate an original publication sentence, author this externally:

```tenet-policy
Rule; Never publish code to a remote repository without explicit approval.
```

Under that example, attempted uploads of source or Git objects to any remote repository count, including private repositories and intermediate uploads before commit/reference updates. Local commits or preparation without upload are not publication. This is not a general outbound-data policy.

A Git commit prohibition concerns creating commits, not local reads, edits or staging. Saving a README edit is not a commit; editing then committing still attempts one. Other rules and integrity apply independently. These meanings guide the evaluator, not a tool exemption or accuracy guarantee.

Tenet checks each source's bytes and resolved target, and confirms absent candidates stay absent, before assessment and permission release. Observe also checks before publishing findings.

Edits, deletion, unreadability, same-byte link retargeting or a new selected candidate invalidate the complete set. Enforce stays blocked; observe permits without a pass and suppresses stale findings. Off/on does not refresh a stale policy.

1. Review and change either policy externally.
2. For Pi policy-only changes, use session-start reload or restart. Code and environment changes need a full process restart. SDK hosts close and reopen sessions. The Claude prototype reselects at bridge start or its existing session reload; keep hook and bridge configuration equal. These are separate host paths, not a shared reload API.
3. Check both source digests, combined digest and total count. A dormant session needs new session start or reload to discover a new file. Make a fresh call rather than reusing pending approval.

Changes while confirmation is open do not authorize that pending action. Integrity is semantic protection, not filesystem isolation. Jev can misclassify actions; hidden aliases may remain unknown. Tenet cannot freeze the filesystem between checking and execution.

Before rolling back grammar support, use the supported short form `Rule; text` externally for policies that need the target version's grammar. Older versions can ignore mode and severity metadata and block by default.

Before rolling back per-rule thresholds, remove that metadata externally; older parsers treat it as prose. All rules then use the global evidence threshold. Historical recordings keep their recorded contracts.

### Use the cooperative on/off switch

Before an activation or control-file change, obtain separate authorization. Turning on permits full policy/selected-evidence disclosure to TypeSafe or Pika, with possible secrets despite redaction, quota/CPU cost, capture and backend logs. Capture-off stops neither disclosure nor all logs. Turning off disables assessment and capture, not old evidence or already released actions.

In an eligible Pi session, `/tenet off` stops new assessment, approvals, trajectory capture and recording through `~/.tenet/control.json`. `/tenet on` restores the process's existing mode and capture settings. Both commands are safe to repeat; neither changes mode or activates a dormant session.

A fresh missing control defaults to on. A malformed or unsafe control is unavailable, not a passing policy decision. Enforce blocks; observe permits without assessing or recording. Native on/off can repair safe malformed content. Fix unsafe permissions or symlinks outside Pi.

The issuing process cancels pending assessments before off reports success. Other processes notice through notifications and a short refresh loop. The command does not wait for them. Already released or dispatched actions cannot be recalled, and a call can complete before another process notices off.

Every new entry and pending release rechecks control, but a change after the final check can race with dispatch. This is a cooperative same-user switch, not an OS security boundary. Same-user processes can change or remove the file; removal lets fresh processes default to on.

Pending archive writes can finish after off. Previous recordings remain.

## Observation and enforcement

Observe is the default. It releases calls after bounded pre-execution capture and evaluates a fixed snapshot in the background. Results can arrive after tool completion or turn end. Findings remain owner-only, not agent messages, tool results or later evaluator evidence, including on recovery.

Absent settings allow two running assessments, 32 waiting and at most 1 MiB retained snapshots, with five-second waiting age. Valid owner JSON can change these limits. The experimental Pika example uses one running, eight waiting, 1 MiB and 120000 ms queue age; it is not a throughput guarantee. Capacity/age excess is dropped without a pass, block or approval.

Provider deadlines apply after dequeue. Pending, dropped, cancelled or unavailable work is never an all-clear.

Off, context/session replacement, stale policy and shutdown cancel background work and suppress late findings. Agent-turn end need not cancel valid observations; missing results become unknown. A crash or bounded shutdown drain can leave incomplete records. Reporting failure does not revoke a released call; reports can be lost.

Before selecting enforcement, obtain separate activation authorization. Full policy and selected evidence reach TypeSafe or Pika, with possible secrets despite redaction, quota/CPU cost, default capture and owner-controlled backend logs. Capture-off stops neither disclosure nor all logs. APUS is experimental; normalized Q8 scores do not establish enforcement safety. After approval, close Pi and start a new process from the project:

```sh
TENET_MODE=enforce pi
```

Check `TENET ON ENFORCE` with `/tenet status`. Only exact `TENET_MODE=enforce` selects enforcement. Invalid mode values select observe with `invalid-mode`. `/tenet on` does not select enforce.

| Blocking rule and integrity results | Enforce decision |
| --- | --- |
| All confidently `PASS` or supported user-rule `NOT_APPLICABLE`, integrity confidently `PASS` | `ALLOW`; `WARN` remains advisory |
| At least one `APPROVAL_REQUIRED`, all other blocking gates pass, integrity passes | `ASK` for this invocation |
| Any blocking rule or integrity `FAIL` | `BLOCK`, no approval override |
| Blocking `UNKNOWN`, low probability or insufficient evidence | `BLOCK` |
| Configuration, credential, provider, response, deadline or cancellation failure | `BLOCK` |

There is no majority vote or averaging. A selected `FAIL` blocks even below threshold. A score equal to threshold passes that score gate.

Supported `NOT_APPLICABLE` needs complete, current host-authenticated facts and the selected-outcome threshold; it has no evidence-confidence gate. Stock Pi cannot supply these facts. The current contract is `applicability-v1`, with no profile switch.

Native approval covers one unchanged pending invocation. The dialog identifies rules with source roles and physical lines, source paths/targets and digests, combined policy digest, session/tool/call identity, original-argument digest and field-redacted arguments.

Only an explicit positive answer releases it. Denial, dismissal, missing UI, UI failure, cancellation, timeout or stale authorization blocks.

Chat, task text, historical approval and an earlier approved call are not permission. A retry needs a new call ID, assessment and any required approval.

Approval waits are serialized and the timeout includes queue time. A late answer cannot approve another invocation. Permission to release is not proof of execution.

## Settings before launch

Private provider selection and JSON deadline/queue limits are in the shipped [judge/settings guide](judge.md). Settings live only in owner `~/.tenet/config.json`, separate from activation. Confirmed absence retains TypeSafe/`jev-latest`; invalid settings are unavailable, never a fallback. APUS needs no TypeSafe key. Only local readiness is checked offline.

Set environment variables in the shell that launches Pi. Code and environment changes require a full process restart. Under Pi 0.85.1 and Bun 1.3.14, `/reload` and `/new` can retain old imports. Doctor reads process environment, not dotenv files or Pi settings.

| Variable | Default | Valid value and effect |
| --- | --- | --- |
| `TENET_MODE` | `observe` | Exact `observe` or `enforce`; invalid selects observe with warning |
| `TYPESAFE_API_KEY` | None | Nonblank TypeSafe credential, set securely; presence is not validity |
| `TENET_EFFECT_THRESHOLD` | `0.90` | Finite number from `0` through `1`; minimum selected outcome probability |
| `TENET_EVIDENCE_THRESHOLD` | `0.90` | Finite number from `0` through `1`; minimum P(SUFFICIENT) where applicable |
| `TENET_JUDGE_DEADLINE_MS` | `2500` | Finite number greater than `0`, at most `2147483647`; overrides JSON deadline; whole-assessment, not per-rule; fractional environment values accepted |
| `TENET_APPROVAL_TIMEOUT_MS` | `60000` | Safe integer from `1` through `2147483647`; includes dialog queue time |
| `TENET_RECENT_EVENTS` | `12` | Safe integer from `0` through `9007199254740991`; `0` omits history |
| `TENET_EVIDENCE_MAX_BYTES` | `24576` | Safe integer from `1` through `9007199254740991`; serialized judge-state UTF-8 byte limit |
| `TENET_SENSITIVE_FIELDS` | `[]` | JSON array of additional nonblank string field names to remove recursively |
| `TENET_RECORDING` | `on` | Exact `on` or `off`; invalid disables capture with an issue |
| `TENET_RECORDING_DIR` | `~/.tenet/recordings` | Actual absolute path, required even when recording is off |
| `TENET_CONTROL_PATH` | `~/.tenet/control.json` | Actual absolute path for cooperative control; relative/empty prevents normal runtime initialization |
| `TENET_POLICY` | Session `TENET.md` | Nonblank absolute or session-relative project source only; global remains selected. Blank or missing explicit source makes the whole set unavailable |

Unset numeric values use defaults. Nonempty values use JavaScript `Number` conversion, then range checks. Empty/blank numeric settings or malformed sensitive-field JSON make guard configuration unavailable.

Observe permits without a pass; enforce blocks in eligible sessions. A dormant runtime does not become eligible from invalid settings. Doctor still flags invalid configuration even when off or dormant.

Recording errors disable capture without changing permission. Unsafe or unreadable control prevents new assessment and capture; observe permits and enforce blocks in eligible sessions. Doctor flags invalid capture/control too. `BB_THREAD_ID` is an optional archive-routing hint, accepted only as `^thr_[a-z0-9]{8,64}$`; invalid values are ignored and policy decisions do not change.

For extra field redaction, in the launching shell:

```sh
export TENET_SENSITIVE_FIELDS='["customerSecret","internalPayload"]'
```

Matching ignores case, hyphens, underscores and whitespace. Recognized credential fields remain removed. Executor arguments do not change. Redaction cannot find all embedded or encoded secrets, and rule text is not secret-scanned.

The TypeSafe client uses `https://api.typesafe.ai`, `jev-latest`, disabled SDK logging and no retries. `jev-latest` is a provider alias, not an immutable release.

Records retain requested/returned model identities. Cancellation reaches the SDK; late responses cannot change a blocked decision. There is no live-mode mock fallback.

## Troubleshooting

Run doctor outside Pi in the launch environment. It never starts hooks or submits evidence. See [the doctor reference](doctor.md) for exit codes and precedence.

| Symptom | What to check |
| --- | --- |
| No footer or `/tenet` command | Confirmed absence of both implicit candidates with no override is dormant in both modes. Registration supplies no policy. Check the selected cwd, author policy externally and restart. If a source is selected, check `pi list` and load errors. A load error means no Tenet hook. |
| Invalid or broken active policy | A malformed or unreadable selected file, broken link or stale policy is unavailable. Check UTF-8 `Rule;` lines, grammar and limits above. Review the selected path externally, reload or restart, and verify digest. Observe permits without a pass; enforce blocks. |
| Invalid settings or selected provider errors | Check provider/alias, deadline and queue with doctor, then the [private setup and rollback guide](judge.md). TypeSafe needs its key; APUS does not. Unreachable Pika, closed forwarding, timeout or a mismatched backend is unavailable, not a pass or fallback. Live connectivity checks require separate full-payload/service authorization. |
| `TENET OFF` or `CONTROL UNAVAILABLE` | `/tenet on` restores this process's mode, not enforce. Fix unsafe permissions/links outside Pi; repair safe malformed content through native on/off. Other processes notice asynchronously. |
| Pending or lost findings | Check status for completed, unavailable, dropped, cancelled and cumulative loss counts. Queue limits and interruptions can lose work. Absence of a report is not `PASS`. |
| Native findings but no inspector history | Recording opt-out leaves native reporting active. Otherwise check capture location and loss/drain counts. Unsafe directories, full disk or queue loss can prevent capture without changing permission. Stop writers before storage repair. |
| Partial or missing inspector stages | Check indexing, unsupported-schema and corrupt-file notices; allow later polls. Missing assessment/result is unknown, not execution proof. Recording is not a transactional audit log. |
| Doctor says ready but coverage is unknown | Pin Pi 0.85.1, fully restart and check native status. Unknown metadata stays unknown. A detected untested version reports unavailable compatibility. Provider validity and hooks remain unverified by doctor. |

## Disclosure and limits

### Store and inspect evidence safely

Assessment sends policy text and identity/paths, host cwd, built-in integrity, copied tool name/description/schema, field-redacted arguments, identities, timestamp, original-argument digest and limitations to the selected judge, TypeSafe or APUS on Pika through owner forwarding. This is full policy and selected evidence, not a harmless health probe.

Bounded recent observations contain earlier tool calls and tool results. Findings, decisions and native approval outcomes remain owner records, not evaluator history. Tool observations remain untrusted evidence, not grants.

Optional history has one third of the serialized state budget; each event's complete data has at most one quarter of that allowance. Defaults are 8 KiB history and 2 KiB per event, including envelopes and metadata. Missing history is not proof of execution. If protected current state or minimal history cannot fit, assessment is insufficient without a provider request, blocking only in enforce mode.

Capture preserves exact submitted application strings, not omitted history or transport headers/API configuration credentials. SDK response snapshots are untrusted, capped at 1 MiB with explicit truncation markers. Records have a 4 MiB limit. Oversized or unserializable records are dropped and counted, not labeled exact.

Recording paths must be absolute with no symlink components. Existing archive directories must be owner-only; unsafe paths disable writes rather than being repaired silently. Directories use `0700`, files `0600`. This unencrypted storage does not protect against same-user agents or processes.

The archive queue permits 64 pending records and 16 MiB total. Normal shutdown drains for up to one second. Capture failures do not change enforcement, approval or permission.

UI shows loss/pending counters and drain timeouts. A crash, full disk or exhausted queue can leave incomplete stages. Records are best-effort diagnostics, not a transactional audit log.

Before starting an inspector service, obtain separate authorization to expose retained full policy and selected evidence to same-user loopback readers. Strings can retain secrets despite redaction. This sends no new judge request, but capture-off does not erase old records/backend logs or stop future provider disclosure. Keep access private.

For retained evidence, run `/tenet-inspector`, or from the stable installation use `npm run inspector:serve`. No Pi or TypeSafe credential is needed for the standalone reader. Use the same `TENET_RECORDING_DIR` as the writer.

The server is read-only, loopback-only and unauthenticated. Do not expose or proxy secret-bearing evidence to another machine.

`TENET_RECORDING=off` stops new local capture only, not provider disclosure or all backend logs. The owner controls Pika log access and retention. Off and uninstall leave old recordings and Pi session files. There is no automatic expiry.

Before deleting retained full policy/evidence or owner control, obtain separate authorization. Secrets can survive redaction; local capture-off does not erase records, backend logs or future disclosure to TypeSafe/Pika. Stop all writers and readers before deleting retained evidence. Removing control separately resets the cooperative choice, not historical evidence.

### Know the host boundary

Pinned Pi 0.85.1 tests prove native pre-release interception with harmless scripted calls. Pi declares interception, lifecycle invalidation and trusted approval. It does not guarantee exact native result correlation, post-hook argument stability or stock authenticated action resolution.

Keep Tenet after argument-mutating hooks. Later hooks and executors must honor the assessed action. Successful native results cannot certify execution in new SDK-backed records; execution status remains unknown. A failed result does not prove that no remote effect occurred.

Tenet does not inspect subprocess internals, user-entered `!` commands, extension-internal execution or background subprocess activity. It does not fetch scripts or browse target systems to collect missing context. Opaque actions can block; a confident but mistaken judge can allow a prohibited action.

Tenet is not filesystem isolation or an OS sandbox. Hidden aliases may remain unknown, and same-user processes can change control or access evidence. Unknown host versions are not verified enforcement. Claude Code is an unverified prototype outside this delivery setup path.

The [SDK guide](sdk.md) describes host obligations and recorded contract versions. Optional [repository documentation](https://github.com/koenvg/Tenet#readme) has wider references and historical evaluation limits. This archive's offline checks do not measure live evaluator accuracy.
