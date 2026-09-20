# TENET policy guard

A TypeScript POC for Pi 0.85.1. Every exposed tool call follows the same rule-evaluation path through Jev using the official `@typesafe-ai/sdk` 0.6.0. No tool allowlists, tool-family mappings or replacement executors.

The original KVG-5093 publication slice is extended by `add-configurable-policy-rules`. Evaluation remains action-local: no execution history, subprocess inspection, OS sandbox or hardened concurrent approval handling.

## Verify offline

Use Bun 1.3.14 or newer. The repository pins Bun 1.3.14 and runs the Pi CLI with Bun. The extension also supports Node-hosted Pi on Node.js 22 or newer.

```sh
bun install --frozen-lockfile
bun test
bun run smoke
bun run typecheck
```

Tests use injected judges, clocks and scripted HTTP responses. The smoke tests exercise the real pinned Pi resource loader and tool dispatcher with scripted assistant output and dummy executors. They verify withholding execution, native approval, policy-integrity blocking and unchanged executor arguments. No credentials or live model calls are required.

These tests verify enforcement mechanics, not semantic accuracy. The saved publication-v3 live reports are historical evidence for the previous questions, not validation of `policy-rules-v1`. No live generic-rule evaluation has been performed. See [eval/README.md](eval/README.md).

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

A loaded sentence is not necessarily assessable. For example, “Always run tests before publishing” requires trusted execution history that this version does not supply; an attempted publication under that rule can block as UNKNOWN. Ambiguous rules and material redactions can also block.

Publication under the example rule includes attempted uploads of source files or Git objects to any remote repository, including private repositories and intermediate uploads before commit creation or reference updates. Local commits and upload preparation without upload are not publication. This rule alone is not a general outbound-data policy.

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

4. Check the footer, for example `TENET ready: 1 rules [policy-rules-v1]`. Startup identifies the policy source, original-byte SHA-256, rule count and question version. A missing credential or invalid policy/configuration reports unavailable and blocks calls. An extension load error means the guard did not load; do not assume protection.
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

ASK shows one native confirmation listing all approval-requiring rules, their source lines, policy identity, tool/call identity and field-redacted arguments. Only an explicit positive response releases that unchanged invocation. Denial, dismissal, missing UI, UI failure and cancellation block. A statement in chat or tool arguments that something was approved is not native confirmation. Approval does not carry to a later invocation or override a failing rule.

## Configuration

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `TENET_POLICY` | `TENET.md` | Absolute path or path relative to session cwd |
| `TENET_EFFECT_THRESHOLD` | `0.90` | Minimum selected per-rule outcome probability; retained name |
| `TENET_EVIDENCE_THRESHOLD` | `0.90` | Minimum sufficient-evidence probability for every rule |
| `TENET_JUDGE_DEADLINE_MS` | `2500` | Overall judge deadline, not per-rule; human approval time is separate |
| `TENET_SENSITIVE_FIELDS` | `[]` | JSON array of additional field names to remove recursively |
| `TYPESAFE_API_KEY` | none | Required TypeSafe credential |

Example: `TENET_SENSITIVE_FIELDS='["customerSecret","internalPayload"]'`. Field matching ignores case, hyphens, underscores and whitespace. Explicit empty or malformed configuration is not a request to disable protection.

Retries are disabled. Cancellation reaches the SDK, and a late response cannot change a blocked decision. Requests use `jev-latest`, which is a provider alias rather than an immutable release. Audit entries retain requested and returned model identities. SDK logging is disabled and the destination is the official TypeSafe endpoint.

## Data disclosure and audit

TypeSafe receives **declared rule text**, policy identity/paths, the host working directory, the built-in integrity constraint and a copied action snapshot: tool name, available description/schema, field-redacted arguments, identities, original-argument digest and limitations. Missing metadata is explicit. No previous tool results or conversation history are sent by TENET.

Recognized credential fields and configured sensitive fields are removed recursively from copied evidence. Executor arguments remain unchanged. Redaction cannot find all secrets embedded in shell commands, source text, URLs, metadata or encoded values. Rule text itself is not secret-scanned. Do not place credentials in your rules.

Version-2 `tenet` custom records distinguish:

- `status`: readiness, policy snapshot, rule count, version and configuration.
- `assessment`: per-rule outcomes and probabilities, model, duration and limitations.
- `decision`: ALLOW/ASK/BLOCK, reason and contributing rule IDs.
- `approval`: native UI outcome and applicable rules.
- `permission`: released or blocked.
- `execution`: observed Pi tool result, executed or failed; unobserved outcomes remain unknown.

Records omit raw arguments, tool schemas, payloads, results and unsolicited provider prose/errors. Policy declarations are part of startup records. Pi's own transcript and other extensions have separate logging behavior. Permission does not prove execution; a successful tool result does not independently verify remote effects.

## Host contract and remaining limits

Pi must expose every agent tool call before execution, await and honor blocks, and execute the assessed arguments without later mutation. Run TENET after argument-mutating hooks. TENET rechecks arguments before release but cannot prevent a subsequent hook changing them. Metadata must describe the actual executor.

TENET does not observe subprocess internals, user-entered `!` commands, extension-internal execution or background tool activity. It does not fetch script contents or browse target systems. Opaque actions can block. A confident but mistaken judge can still allow a prohibited action.

Use a controlled, single-invocation POC session. Concurrent dialog serialization, full session/reload/branch invalidation, trajectory recovery, adversarial live evaluation and remote-state verification remain deferred. The integrity check is not a tamper-resistant production boundary.

## Independent decision entry

`src/decision/decide.ts` imports no Pi code. Call `decide({ policy, action, cwd, judge, ... })` with a loaded policy set, captured action and trusted host working directory. Offline callers inject a scripted `Judge`; deadline tests can inject a `Clock`. `createJevJudge` uses TypeSafe and makes live calls when invoked with credentials. ALLOW and ASK are decisions for the caller to enforce, not execution commands. Pi owns the policy freshness checks and native confirmation.
