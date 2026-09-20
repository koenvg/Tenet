# TENET policy guard

A TypeScript POC for Pi 0.85.1. Every exposed tool call follows the same rule-evaluation path through Jev using the official `@typesafe-ai/sdk` 0.6.0. No tool allowlists, tool-family mappings or replacement executors.

The original KVG-5093 publication slice is extended by configurable policy rules, KVG-5094's bounded recent observations and KVG-5095's invocation-bound approval. No subprocess inspection or OS sandbox.

## Verify offline

Use Bun 1.3.14 or newer. The repository pins Bun 1.3.14 and runs the Pi CLI with Bun. The extension also supports Node-hosted Pi on Node.js 22 or newer.

```sh
bun install --frozen-lockfile
bun test
bun run smoke
bun run typecheck
```

Tests use injected judges, clocks and scripted HTTP responses. Offline host tests assert executor calls for concurrent approvals, argument changes, lifecycle transitions, retries and forged consent. The smoke tests exercise the pinned Pi resource loader and tool dispatcher with scripted assistant output and dummy executors. They verify withholding execution, native approval, policy-integrity blocking and executor arguments after an earlier extension mutates them. No credentials or live model calls are required.

These tests verify enforcement mechanics, not semantic accuracy. The saved publication-v3 reports are historical evidence for previous questions. A separate 33-request `policy-rules-v2` live run allowed both reported actions in all repetitions, but still found false blocks and invalid responses. See [eval/README.md](eval/README.md) for the results and limitations.

## Write your policy

Each declaration is one line beginning with the case-sensitive prefix `Rule;` after trimming whitespace. The remainder is plain text, not code. For example:

```tenet-policy
Rule; Never publish code to a remote repository without explicit approval.
Rule; Never delete files outside the project directory.
Rule; Ask before installing dependencies.
```

Rules are assessed individually. The complete meaning matters: **“Never X without approval”** can require confirmation, while **“Never X”** prohibits X outright. A rule that does not apply to the action passes. Contradictory rules do not cancel each other out: a prohibition takes precedence over an approval condition.

The parser is deliberately line-based, not Markdown-aware:

- Headings, blank lines and unmarked prose are ignored, not enforced.
- A `Rule;` line inside a code fence is still active. Do not put illustrative declarations in your active policy unless you intend to enforce them.
- Each rule occupies one physical line. Further semicolons are part of its text.
- Duplicate declarations remain separate entries, identified by policy digest and source line.
- The file must be valid UTF-8, at most **64 KiB**, with **1–16 rules**, each at most **4096 UTF-8 bytes** after trimming.
- Empty declarations, no declarations, invalid encoding, exceeded limits or an unavailable file make the entire policy unavailable. TENET never silently truncates the rule set.

A loaded sentence is not necessarily assessable. A rule requiring prior tests can still produce UNKNOWN when recent observed calls and results do not establish what ran. Ambiguous rules, omitted history and material redactions can also block.

Publication under the example rule includes attempted uploads of source files or Git objects to any remote repository, including private repositories and intermediate uploads before commit creation or reference updates. Local commits and upload preparation without upload are not publication. This rule alone is not a general outbound-data policy.

Under a Git commit prohibition, creating a commit is distinct from reading, editing or staging working-tree files. Saving a README edit is not a Git commit. A sequence that edits and then commits still attempts a commit; other rules and policy integrity apply independently. This is evaluator guidance, not a tool exemption or a guarantee that the judge will classify correctly.

### Owner-only policy management and migration

Agent actions that modify, remove, replace, rename or redirect the **active selected policy** are subject to a built-in, non-overridable integrity constraint. This protects the selected path and resolved target, including evidenced aliases and parent-directory replacement. Adding a rule that permits policy edits does not remove the constraint. Reading the policy remains allowed when sufficiently understood.

**Edit your active policy yourself, outside the intercepted agent path.** Do not ask the guarded agent to migrate or weaken it. Existing unprefixed publication prose is no longer accepted, and TENET will not rewrite it for you.

For the original policy, replace the unprefixed sentence with:

```tenet-policy
Rule; Never publish code to a remote repository without explicit approval.
```

The bundled `TENET.md` uses the explicit declaration format. Legacy unprefixed files report `policy-format` and block intercepted calls until migrated.

Before release, TENET verifies that policy bytes and the resolved target still match the loaded snapshot. A mismatch or read failure blocks with `policy-stale` and remains blocked until session-start reload or restart. Changing the file while a confirmation is open does not authorize the pending action under either policy.

This is semantic protection, not filesystem isolation. Jev can misclassify an action, hidden aliases may be unknown, and TENET cannot freeze the filesystem between checking and execution or stop activity outside its hooks.

To roll back, restore both the previous extension version and its publication-only policy file externally, then restart. The old version does **not** enforce the additional rules.

## Enable in Pi

1. Review and, if necessary, migrate the selected policy externally as above.
2. Set `TYPESAFE_API_KEY` using your normal secret-management method. Never put secrets in policy text or the repository.
3. Start the pinned Pi process with only this explicitly selected extension:

   ```sh
   bun run pi --no-extensions
   ```

   The package script adds `-e ./src/pi/extension.ts`. Explicit extensions still load with `--no-extensions`.

4. Check the footer, for example `TENET ready: 1 rules [policy-rules-v3-trajectory]`. Startup identifies the policy source, original-byte SHA-256, rule count and question version. A missing credential or invalid policy/configuration reports unavailable and blocks calls. An extension load error means the guard did not load; do not assume protection.
5. You can try reading a local file. This makes a live judge request, unlike the offline tests.

Code or environment changes require a **full Pi process restart**. Under Pi 0.85.1 and Bun 1.3.14, `/reload` and `/new` can retain old module imports. Policy-file-only changes can use the session-start reload path; check the new digest and count.

Loading the extension enables it. Unloading it removes protection. There is no live-mode mock fallback. Use `bun run smoke` rather than a real upload to test approval safely.

## Decisions and approval

One bounded Jev request contains an outcome question and evidence-sufficiency question for each user rule, plus the immutable policy-integrity constraint. TENET validates the complete response and applies deterministic aggregation:

| Results | Decision |
| --- | --- |
| Every rule and integrity constraint confidently PASS | ALLOW |
| At least one APPROVAL_REQUIRED, all others confidently PASS | ASK |
| Any FAIL | BLOCK; no approval override |
| Any UNKNOWN, low probability or insufficient evidence | BLOCK |
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

## Data disclosure and audit

TypeSafe receives declared rule text, policy identity/paths, the host working directory, the built-in integrity constraint and a copied action snapshot: tool name, available description/schema, field-redacted arguments, identities, timestamp, original-argument digest and limitations. Bounded chronological observations include earlier calls, text or structured results, decisions and native approval outcomes. Every observation carries session/call/tool identity, host origin and timestamp, with explicit missing-metadata markers.

The pending action is kept intact. Older observations are omitted first to fit the event and byte budgets, with omission counts. If the action and required judge state cannot fit, TENET blocks for insufficient evidence without asking Jev. Image content is marked unsupported, never converted into invented text. Conflicting and outdated observations are retained within the budget for the judge to assess.

At session start, TENET restores only bounded observations from the selected Pi session branch and its own decision/approval entries. Recovered history and all tool-supplied content remain untrusted evidence, never executable approval grants. Later sibling results cannot alter an in-flight assessment. TENET calls no tools to gather missing context.

Recognized credential fields and configured sensitive fields are removed recursively from copied evidence. Executor arguments remain unchanged. Redaction cannot find all secrets embedded in shell commands, source text, URLs, metadata or encoded values. Rule text itself is not secret-scanned. Do not place credentials in your rules.

Version-2 `tenet` custom records distinguish:

- `status`: readiness, policy snapshot, rule count, version and configuration.
- `assessment`: per-rule outcomes and probabilities, model, duration and limitations.
- `decision`: ALLOW/ASK/BLOCK, reason, contributing rule IDs, question version and per-rule `diagnostics` with gates, labels, scores and thresholds. Older records can lack the added fields; their assessment and configuration remain available.
- `approval`: native UI outcome and applicable rules.
- `permission`: released or blocked.
- `execution`: observed Pi tool result, executed or failed; unobserved outcomes remain unknown.

Each intercepted invocation receives an `invocationId`, separate from the host's call ID. Assessment, decision, approval, permission and execution records retain that identity with session, tool, call, policy digest and assessed original-argument digest. ALLOW is not human approval, and neither ALLOW nor positive approval is proof of execution. Released invocations without a result become `unknown` at agent end or lifecycle invalidation. A failed result does not prove the action had no remote effect. A retry requires a new host call ID, fresh assessment and any required approval. Duplicate host IDs invalidate pending work rather than ambiguously associating a result.

Records omit raw arguments, tool schemas, payloads, results and unsolicited provider prose/errors. Policy declarations are part of startup records. Pi's own transcript and other extensions have separate logging behavior. A successful tool result does not independently verify remote effects. After a crash that prevents final logging, absence of a result still must not be interpreted as success.

## Host contract and remaining limits

Pi must expose every agent tool call before execution, await and honor blocks, and execute the assessed arguments without later mutation. Load TENET after all argument-mutating `tool_call` extensions and register its handler after mutators within the same extension. The pinned Pi smoke test checks this ordering with an earlier mutating extension and compares both the assessed snapshot and executor payload with the expected post-mutation arguments.

TENET rechecks arguments, cancellation, session identity and policy before returning permission. The host must prevent subsequent mutation, honor cancellation before dispatch, supply unique tool-call IDs within each session and deliver lifecycle events before replacing or tearing down the runtime. Later hooks, retained argument references, tool preparation and executors must not change the assessed action after permission. Metadata must describe the actual executor. This is an integration contract, not a frozen-argument or protected-executor mechanism.

TENET does not observe subprocess internals, user-entered `!` commands, extension-internal execution or background tool activity. It does not fetch script contents or browse target systems. Opaque actions can block. A confident but mistaken judge can still allow a prohibited action.

Concurrent approval and lifecycle behavior have offline contract coverage. Adversarial live evaluation and remote-state verification remain separate work. The integrity check is not a tamper-resistant production boundary. The trajectory questions have offline contract coverage, not live semantic validation.

## Independent decision entry

`src/decision/decide.ts` imports no Pi code. Call `decide({ policy, action, cwd, judge, ... })` with a loaded policy set, captured action and trusted host working directory. Offline callers inject a scripted `Judge`; deadline tests can inject a `Clock`. `createJevJudge` uses TypeSafe and makes live calls when invoked with credentials. ALLOW and ASK are decisions for the caller to enforce, not execution commands. Pi owns the policy freshness checks and native confirmation.
