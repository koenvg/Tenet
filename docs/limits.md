# Findings, permission and data limits

Use this reference to check what Tenet can report, release and record before you authorize an action. It covers the current Pi integration, alpha SDK and opt-in Claude Code prototype. Tenet is not an OS sandbox. A confident but mistaken judge can allow a prohibited action, and activity outside host hooks is not covered.

For launch and recording tasks, use [the inspector guide](inspector.md). For exact settings, use [configuration](configuration.md). These are developer-checkout references; required archive steps and warnings remain in the shipped [installation](INSTALL-ARCHIVE.md) and [operation](ARCHIVE-OPERATION.md) guides.

Look up the limit that affects your action:

- [Observe versus enforce](#observe-first-enforce-later) and [one-call approval](#enforcement-decisions-and-approval).
- [A block diagnostic](#read-a-block-diagnostic) or [lost observation coverage](#background-observation-can-lose-coverage).
- [What the selected judge receives](#data-disclosure-and-audit) and [local storage](inspector.md#sensitive-local-storage).
- [Host duties](#host-contract-and-remaining-limits), [action targets](#optional-host-authenticated-action-targets) and [cooperative control](#owner-control-is-not-isolation).

## Observe first, enforce later

`observe` is the default. It never vetoes or requests approval, including for integrity findings, missing credentials, invalid configuration, timeouts or reporting failures. Host restrictions, cancellation and ordinary tool errors still apply. Only exact `TENET_MODE=enforce` enables enforcement. An invalid value selects observe and reports `invalid-mode`.

Mode is fixed for the process. To change it, close Pi and start a new process. This is a live-capable launch, not an offline test. Assessed actions send data to the selected judge. TypeSafe uses quota; APUS uses the owner-operated backend. Read [disclosure](#data-disclosure-and-audit) before authorizing any real action.

From an installed archive's project directory:

```sh
TENET_MODE=enforce pi
```

Check `TENET ON ENFORCE` with `/tenet status`. `/tenet on` restores the process's configured mode; it does not select enforce.

An assessment describes a finding. Permission says whether Tenet released the call. ALLOW is not human approval.

Execution records depend on host result correlation. Current SDK-backed Pi execution remains unknown even with native success or failure; historical recorded outcomes stay unchanged. Neither ALLOW nor approval proves execution or independently verifies a remote effect. A failed result does not prove that no remote effect occurred.

## Read owner findings

In an eligible Pi session, the footer shows mode, pending/completed/loss counts and coverage status. Bare `/tenet` opens up to 100 recent nontrivial reports plus outstanding pending assessments, newest first. Select a report for rule locations, settings, labels and exact score gates. Native selectors scroll; Escape closes a view. There are no per-call popups.

Reports name the recorded provider and requested/returned model, not the current selection. APUS is experimental under `judge-report-v1`. Configuration readiness is not connectivity or successful assessment.

Completed execution, expected-label matching and calibration remain distinct; deterministic NONE probability one is not model confidence or authenticated coverage.

Pending entries cannot evict a later finding. Older terminal reports have a visible eviction count. A dormant session has no Tenet footer, notifications or commands.

Observe findings describe what enforcement would do, separately from permission and execution. A low-confidence PASS is uncertainty, not a detected violation. Pending, unavailable, cancelled, dropped or missing evidence is not an all-clear.

Findings never enter agent messages, tool results or later evaluator evidence, including on recovery. UI-less runs retain non-message session records where possible and write no observation reports to protocol stdout. Owner-only reporting is not filesystem confidentiality.

## Background observation can lose coverage

Observe returns permission after bounded pre-execution capture. The judge later assesses that frozen snapshot, possibly after a result or agent turn. It does not revalidate against post-execution state or revoke a released action.

| Observation queue limit | Built-in default |
| --- | --- |
| Running assessments | 2 |
| Waiting assessments | 32 |
| Total retained snapshots | 1 MiB |
| Maximum waiting snapshot age | 5 seconds |

Excess or expired work is dropped without a pass, block or approval. Queue wait is separate from the configured provider deadline, which starts after dequeue. `/tenet status` distinguishes pending, completed, unavailable, dropped and cancelled work and shows cumulative queue losses. Capture opt-out leaves observation and reporting active.

Owner JSON and SDK limits can replace these defaults. Check the frozen effective limits in status, rather than assuming APUS uses a model-specific timeout or queue. See [judge settings and precedence](judge.md#defaults-limits-and-precedence).

Off, context/session replacement, stale policy and shutdown cancel work and suppress late findings. Shutdown does not wait indefinitely for a judge, and its bounded archive drain can lose unwritten stages. Agent-turn end marks unmatched results unknown but does not cancel valid background assessments. Already released calls cannot be recalled.

If every reporting channel fails, observation still permits calls and reports can be lost. Reporting failures appear in the footer when it remains available. A crash can leave a pending record incomplete. Results are recorded independently of permission and assessment; missing stages stay unknown.

## Enforcement decisions and approval

One canonical assessment asks outcome and evidence-sufficiency questions for every rule, plus fact-reference questions for user-rule applicability. TypeSafe sends one `systemOne` request; experimental APUS uses sequential native scoring under one deadline.

Threshold settings do not change semantic instructions. Both use common complete-response validation and deterministic BLOCK/integrity gates. WARN remains owner-only and does not vote, veto or open approval.

| Validated blocking results in enforce mode | Decision |
| --- | --- |
| Every BLOCK rule confidently PASS or supported NOT_APPLICABLE, and integrity confidently PASS | ALLOW |
| At least one BLOCK rule APPROVAL_REQUIRED, the rest confidently PASS or supported NOT_APPLICABLE, and integrity confidently PASS | ASK |
| Any BLOCK rule or integrity FAIL | BLOCK, no approval override |
| Any blocking rule UNKNOWN, low probability or insufficient evidence | BLOCK |
| Configuration, credential, provider, response, deadline or cancellation failure | BLOCK |

WARN remains advisory in every row and in either mode. There is no majority vote or averaging across rules. Experimental probabilities are not calibrated correctness or safety guarantees.

ASK opens one native confirmation for the pending invocation. It lists every approval-requiring rule, source lines, policy digest, session/tool/call identity, original-argument digest and field-redacted arguments.

Only an explicit positive response releases that unchanged invocation. Denial, dismissal, missing UI, UI failure, cancellation or timeout blocks it. Chat, task text and historical approvals are never permission. Approval does not cover another tool, a later call, a retry or the session. A prohibition has no approval exception.

Native dialogs are serialized. `TENET_APPROVAL_TIMEOUT_MS` defaults to `60000`, including queue time, and accepts integers from 1 through 2147483647. Queued calls are checked again before their dialog opens. Cancellation signals native UI and blocks immediately. If UI ignores cancellation, the slot stays occupied until its promise settles. Later calls can time out without opening a dialog. A late answer cannot approve another invocation.

Session-start reload, shutdown and switch/fork/tree hooks invalidate pending work. Agent end invalidates pending enforcement but permits valid background observations to finish. Even a cancelled branch/switch attempt discards approvals; a fresh call needs assessment again. Session and policy identity are checked before enforce release and before publishing observe findings.

A policy-byte or resolved-target change cancels pending work and latches `policy-stale`. Enforcement stays blocked until session-start reload or restart; observation permits with unavailable coverage. Read failure also prevents enforcement release. Changes during confirmation never authorize the pending action. Edit the active policy outside the intercepted agent path. [Policy integrity](policy.md) is semantic protection, not filesystem isolation.

## Read a block diagnostic

Both global probability thresholds default to `0.90`. Selected FAIL always blocks a BLOCK rule, even below that probability. A passing label can also block:

```text
TENET blocked: insufficient-evidence. Rules: line 4.
line 4: outcome-confidence-below-threshold; outcome=PASS p=0.88 threshold=0.9; evidence=SUFFICIENT p(SUFFICIENT)=0.93 threshold=0.9
```

Here evidence is sufficient; only outcome confidence fails. The aggregate `insufficient-evidence` reason is retained for compatibility. Each blocking rule lists all triggered gates:

- `rule-fail`
- `outcome-unknown`
- `outcome-confidence-below-threshold`
- `evidence-insufficient`
- `evidence-confidence-below-threshold`

Equality passes a threshold gate. Evidence probability always means P(SUFFICIENT), even when the selected evidence label is INSUFFICIENT. Per-rule evidence overrides do not bypass FAIL, UNKNOWN, INSUFFICIENT or invocation-local approval. Supported NOT_APPLICABLE has no evidence-confidence gate; integrity always retains its separate gate. See [the complete assessment contract](assessment-contract.md).

Native details contain bounded rule locations, validated labels and scores, not arguments or provider explanations. Invalid or failed assessments have no invented rule scores. No debug flag or raw request log is needed.

### Response validation and precision

Precision accommodation is unsupported for `@typesafe-ai/sdk` 0.6.0 and `jev-latest`. TypeSafe's [Choice contract](https://docs.typesafe.ai/primitives/choice) requires unit-sum probabilities and a chosen label with the highest probability. No normative rounding precision or error-bound contract was verified.

Tenet keeps its absolute unit-sum check of `0.000001`, including injected judges. It rejects a total of `0.99`, not normalizes it. Unavailable assessments carry the first bounded `validationIssue` code, not every defect:

| Code | Failure |
| --- | --- |
| `response-shape` | Incompatible response shape |
| `labels` | Invalid or missing labels |
| `score-range` | Invalid probability range |
| `unit-sum` | Probabilities do not sum to 1 within the tolerance |
| `selected-choice` | Chosen label does not have the highest probability |

Owner detail and inspector explanations do not include provider prose, labels or raw values in the validation issue. `unit-sum` states that precision accommodation is unsupported. Historical records without codes keep their decisions and receive no inferred precision diagnosis. Checked sources and historical verification are in [TENET-6's record](TENET-6-handoff.md).

## Data disclosure and audit

The selected judge receives declared rule text, policy identity/paths, host working directory, built-in integrity constraint and a copied action snapshot. The snapshot includes tool name, available description/schema, field-redacted arguments, identities, timestamp, original-argument digest and limitations. Bounded observations contain earlier tool calls and text or structured tool results. Each has session/call/tool identity, host origin and timestamp, with explicit missing-metadata markers.

The default TypeSafe destination is fixed. Experimental APUS sends the complete rendering to the configured loopback backend, or Pika through owner-operated private forwarding.

No TypeSafe key is forwarded. Backend logging, retention and resource use remain the owner's responsibility. Capture-off does not stop that disclosure or backend logs.

Any live evaluation needs separate authorization.

Findings, decisions and native approval outcomes remain owner records. They do not enter evaluator history.

Recognized credential fields and configured sensitive fields are removed recursively from copied evidence. Executor arguments remain unchanged. Field matching ignores case, hyphens, underscores and whitespace. Redaction cannot find every secret in commands, source, URLs, metadata or encoded values. Rule text is not secret-scanned. Do not put credentials in rules.

Pending arguments and current resolved facts remain intact. Optional current tool description/schema can be removed under total-state pressure. History defaults to 12 recent events within 24 KiB serialized judge state. Its separate allowance is at most one third of the state budget, including envelopes and metadata. Each complete event data envelope is at most one quarter of that allowance. Defaults give 8 KiB history and 2 KiB per event, never enlarged by unused history capacity.

Large strings use UTF-8-safe head/tail excerpts with original sizes and ranges. Unsupported structures have explicit omissions. Selection prefers newer recorded call/result groups, shortens before dropping whole groups and preserves provenance. Batch admission inspects at most 4,096 recent slots. Excluded prefixes and invalid envelopes remain prior omissions. Missing, reused or preceding-result identities do not authenticate a pair.

If protected state or the minimal history envelope cannot fit, Tenet reports insufficient evidence without calling the judge. Only enforce vetoes. Missing history never proves execution or success. Exact budgets, representations and historical counters are in [inspection evidence](inspection-evidence.md).

At session start and after re-enabling, Pi restores bounded tool observations from the selected branch. `nativeHistory` admits calls/results only when their call ID has a matching same-session Tenet record inside the inspected window. That record must have mode `observe` or `enforce` and either:

- Stage `permission` with a string `wouldDecision`.
- Stage `assessment-status` with status `completed`.

These records establish admission, not consent or execution. The translator emits only `tool-call` and `tool-result` observations. Findings, decision records and approval outcomes do not enter judge history, live or recovered. Off-state and other calls without this correlation are excluded.

The owner view separately restores validated version-3 permission records from that branch. Recovered history and tool content remain untrusted, not grants. Later sibling results cannot change an in-flight request. Tenet calls no tools to gather missing context.

Retries and cross-provider fallback are disabled. Native requests share the whole-assessment deadline. Client cancellation prevents acceptance of late responses but does not prove backend CPU work stopped. TypeSafe requests `jev-latest` at its official endpoint with SDK logging disabled. APUS checks the configured alias against backend metadata; an alias is not proof of weights. Archives retain requested identity on failure and returned assessment identity only after complete validation.

### Native records and archive payloads differ

Version-3 `tenet` custom records include mode and these stages:

| Stage | Recorded meaning |
| --- | --- |
| `status` | Readiness, policy snapshot, rule count, version and configuration |
| `assessment` | Per-rule outcomes/probabilities, model, duration and limitations |
| `assessment-status` | Independent assessment lifecycle: `pending`, `completed`, `unavailable`, `dropped` or `cancelled`; not permission or execution |
| `decision` | ALLOW/ASK/BLOCK, reason, contributing rule IDs, question version and per-rule `diagnostics` with gates, labels, scores and thresholds |
| `approval` | Native UI outcome and applicable rules |
| `permission` | Actual release/block, counterfactual `wouldDecision`, assessment availability, reasons, safe rule references and findings |
| `execution` | Recorded observed outcome. Historical records can report executed or failed; current SDK-backed Pi outcomes remain unknown because Pi lacks exact result correlation. |

Older records can lack diagnostics; their recorded assessment/configuration remains available. Version-2 records and historical evaluation reports keep their original enforcement meaning. Do not reclassify them as observe results.

Each intercepted call has an `invocationId`, distinct from the host call ID. Assessment, decision, approval, permission and execution retain it with session, tool, call, policy digest and assessed original-argument digest.

Released calls without results become `unknown` at agent end or lifecycle invalidation. Current SDK-backed Pi execution remains `unknown` even when native results report success or failure; historical executed/failed outcomes remain recorded. Retries need a new host call ID, fresh assessment and any required approval. Duplicate host IDs invalidate pending work instead of ambiguously linking results.

Native custom records omit raw arguments, schemas, payloads, results and unsolicited provider prose/errors. Startup records include policy declarations. Pi transcripts and other extensions log separately. A successful result does not independently verify remote effects, and no final log after a crash is not success.

The separate local archive can contain the exact submitted application payload and bounded SDK response. Its writer uses schema 4; native custom-record version 3 is not archive schema 3. See [storage budgets, redaction, retention and deletion](inspector.md#sensitive-local-storage) and [historical archive attribution](cross-host-recordings.md).

APUS retains this canonical payload and adds versioned native rendering/mapping snapshots under the same capture controls. Responses are bounded, untrusted and sanitized, with explicit omissions. Owner findings name APUS experimental and distinguish deterministic selectors from model scores. See [the native recording contract](assessment-contract.md#native-recording-contract).

## Optional host-authenticated action targets

A companion executor can supply versioned, bounded facts through `GuardRuntime` or Pi's `registerGuard` configuration. Tenet binds them to host, session, context, invocation and original arguments, separates literal from executed content, and revalidates the full snapshot before enforce release. Arguments, descriptions and old transcript anchors cannot register facts.

Stock Pi and Claude integrations report **unsupported action resolution**. Ordinary reads and edits do not automatically qualify for NOT_APPLICABLE. Injected resolver tests prove the contract, not deployed-host coverage. The companion executor must honor the checked operation after release or reject a changed binding. See [resolver requirements](action-resolution.md).

Authenticated facts establish the described operation, not the model's correct interpretation of any rule. Shell and opaque execution stay unresolved, even if a command appears read-only. No tool-name or rule-text allowlist exists.

## Host contract and remaining limits

Pi must expose every agent tool call before execution, await/honor blocks and execute assessed arguments without later mutation. Load Tenet after argument-mutating `tool_call` extensions and register its handler after mutators in the same extension. The pinned smoke test checks an earlier mutator and compares both assessed snapshot and executor payload with expected post-mutation arguments.

Tenet rechecks arguments, cancellation, session identity and policy before permission. The host must then prevent mutation, honor cancellation before dispatch, supply unique call IDs within each session and send lifecycle events before replacement/teardown. Later hooks, retained references, tool preparation and executors must not change the action. Metadata must describe the actual executor. This is an integration contract, not a mechanism that freezes arguments or protects executors. Pi does not guarantee exact native-result correlation or stock authenticated effects.

Tenet does not inspect subprocess internals, user-entered `!` commands, extension-internal execution or background tool activity. It does not fetch scripts or browse target systems. Opaque actions can block. Integrity is not a tamper-resistant production boundary.

Concurrent approval and lifecycle behavior have offline contract tests. Trajectory questions have offline coverage, not live semantic validation. Adversarial live evaluation and independent remote-state verification remain separate work.

The [Claude command-hook prototype](claude-code.md) is opt-in and has only offline protocol tests. No pinned Claude host was verified. Pi installation or enforce mode does not establish Claude coverage; its stock CLI has no trusted live owner approval UI.

## Offline and historical evidence

Offline tests use injected judges, clocks and scripted HTTP responses, not live credentials. Host tests check executor calls for concurrent approvals, argument changes, lifecycle transitions, retries and forged consent. Smoke tests use the pinned Pi resource loader/dispatcher, scripted assistant output and dummy executors. They check withheld execution, native approval, integrity blocking and arguments after an earlier mutator.

These checks establish mechanics, not semantic accuracy. The controlled publication flow requires separate live authorization and independent remote reads; KVG-5097 has offline coverage only, with no live publication claim. See [the publication demonstration](../eval/publication-demo-README.md).

Saved publication-v3 reports are historical evidence for previous questions. A separate 33-request `policy-rules-v2` live run allowed both reported actions in every repetition but also found false blocks and invalid responses. See [evaluation results and limits](../eval/README.md). These historical claims do not validate current model accuracy or host coverage.

## Owner control is not isolation

`/tenet off` stores a cooperative machine-wide choice in `~/.tenet/control.json` and skips new assessments, approvals, trajectory capture and recording. `/tenet on` restores each process's configured mode/capture settings, not a dormant session. A missing control file defaults to on.

The issuing process cancels pending assessments before reporting off. Other Pi processes notice through notifications and a short refresh loop; the command does not wait for them. A call may finish before they notice. Every new guard entry and pending release rechecks the file, but a final-check/dispatch race remains. Same-user agents or processes can change/remove the file. Removing it lets fresh processes start on.

A corrupt/unreadable control file shows `TENET CONTROL UNAVAILABLE` only in eligible sessions. Enforce blocks; observe permits without assessment or capture. Repair a safe malformed file with `/tenet on` or `/tenet off`; fix unsafe permissions or symlinks outside Pi.

Pending writes can finish after off. Old evidence remains until separately deleted. Uninstalling the package does not erase the control file or archive. Older extensions can ignore the control file and restore missing-policy unavailability. See [archive removal and rollback](INSTALL-ARCHIVE.md#removal-and-rollback).

The switch also applies to an explicitly installed local Claude bridge/hooks. Pi loading alone neither installs nor verifies them. Shared-file propagation and pinned policy/no-policy Pi tests are offline; they do not establish live multi-process behavior with TypeSafe credentials.

## BB status is a read-only view

The optional [BB status plugin](../bb-plugin-tenet-status/README.md) reads validated recorded selected FAIL outcomes on the Pi thread's machine. It does not start Tenet, change protection, approve actions or change permission/execution. A blank thread means unknown coverage, not a pass.

A valid BB-provided `BB_THREAD_ID` is an optional routing hint on new Pi archive records. It changes neither session keys nor policy decisions. Older unlinked records stay in the standalone inspector; BB never assigns them by cwd, time or native session ID. Missing/unreadable archives mean unknown or unavailable coverage.
