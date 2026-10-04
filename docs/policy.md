# Write and check your policy

Use this guide to write rules for a Pi project. Start with one rule, check it offline, then inspect findings in observe mode. The later sections give the exact grammar and owner controls.

This is a checkout reference. Production archive owners can use the self-contained [archive operation guide](ARCHIVE-OPERATION.md#eligibility-and-owner-control).

## Write a first rule

You need an installed Tenet extension and a project directory you control. For archive installation, follow [Install the archive](INSTALL-ARCHIVE.md). No owner policy ships in the archive.

Edit the active policy yourself in an editor or owner shell, outside the guarded agent's intercepted path. Tenet's built-in integrity constraint protects it, but Tenet is not a filesystem sandbox. Keep policy creation, migration and weakening outside that agent path.

1. Open or create `TENET.md` in your project directory. Tenet selects only this file in the session working directory. It does not search parent directories or use the installation's policy.
2. Add this declaration on one physical line:

   ```tenet-policy
   Rule; Ask before overwriting owner-demo.txt.
   ```

   `Rule; text` is the supported short form. It defaults to `BLOCK`, so this rule can require approval in enforce mode. Explicit `BLOCK` is optional.

   This illustrative local rule is not a complete security policy; review the rules you need.
3. Run the offline doctor from the project directory. Replace `/absolute/path/to/tenet` with the installation containing the compiled CLI:

   ```sh
   TENET_DIR=/absolute/path/to/tenet
   node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD"
   ```

   A checkout needs compiled SDK/CLI and inspector output first. See [Run doctor](doctor.md#direct-invocation). There is no installed global `tenet` command.
4. Check the selected source, SHA-256 digest and declared rule count. This example has `1` rule, excluding built-in integrity. If doctor rejects it, use [the policy fixes](#fix-a-rejected-or-unavailable-policy) below.

A valid policy can still produce `unavailable` with `missing-credentials`. If its source, digest and count match, continue with credential setup below. Fix other issues before launch.

`ready` means local prerequisites are valid. It does not verify active hooks, credential validity or provider connectivity.

## Inspect your first findings

Real assessed actions send policy text, paths, tool evidence and bounded recent observations to TypeSafe and use provider quota. Redaction cannot remove all secrets embedded in rules, source or commands. Keep credentials out of policy text.

Local capture is on by default and can retain secret-bearing submitted strings in `~/.tenet/recordings`. Set `TENET_RECORDING=off` before launching if you do not want new capture. This does not prevent provider disclosure, disable native findings or delete old records.

Observe reports what enforcement would do but never vetoes or opens approval, including for integrity failures or unavailable assessment. Do not test setup with a destructive action or real publication. A live check needs separate authorization.

1. Configure `TYPESAFE_API_KEY` through your secret manager before starting Pi.
2. From your project directory, start a fresh installed Pi process:

   ```sh
   TENET_MODE=observe pi
   ```

3. Check `TENET ON OBSERVE` and `/tenet status`. Use `/tenet` to inspect owner findings. For installation or status failures, follow [archive troubleshooting](ARCHIVE-OPERATION.md#troubleshooting).

## Choose your next policy task

- To diagnose dormancy, see [policy selection](#choose-the-policy-file).
- To add advisory rules or metadata, see [grammar and limits](#rule-grammar-and-limits).
- To understand approval conditions and prohibitions, see [rule meaning](#check-what-a-rule-means).
- To change an active policy, see [owner-only management and reload](#owner-only-policy-management-and-migration).

## Choose the policy file

```text
TENET.md in the session working directory only
  |
  +-- missing at startup -> dormant
  +-- present            -> validate the whole file
```

- A missing local `TENET.md` makes both modes dormant. There is no assessment, veto, approval, recording, footer, notification or Tenet command. An `@TENET.md` prompt attachment does not activate the guard.
- A present invalid or unreadable file, missing credential or invalid guard configuration makes assessment unavailable. Observe permits without claiming a pass; enforce blocks. Deletion after activation is unavailable, not dormant.
- A file that appears after dormant startup needs a new session or extension reload. `/tenet on` cannot activate a dormant session.
- `TENET_POLICY` has no effect, even when empty or whitespace-only. For an older override-based setup, [migrate to a local policy](#migrate-from-tenet_policy) before restarting.

## Rule grammar and limits

After trimming whitespace, a declaration must begin with case-sensitive `Rule;`. Rule text is plain text, not code. Start with `Rule; text`; add severity or metadata only when you need it.

| Form | Meaning |
| --- | --- |
| `Rule; text` | Supported short form, default severity `BLOCK` |
| `Rule; BLOCK; text` | Same blocking severity, stated explicitly |
| `Rule; WARN; text` | Advisory rule, never blocks or opens approval |
| `Rule; BLOCK; evidenceThreshold=0.95; text` | Blocking rule with its own evidence-confidence threshold |
| `Rule; WARN; evidenceThreshold=0.8; text` | Advisory rule with its own evidence-confidence threshold |

The parser reads physical lines, not Markdown structure:

- Headings, blank lines and unmarked prose are ignored, not enforced.
- A `Rule;` line inside a code fence is still active. Put only intended rules in an active policy.
- Each rule occupies one physical line. Only exact uppercase `BLOCK;` or `WARN;` at the start of the trimmed declaration remainder sets explicit severity. Other text remains rule prose with default `BLOCK` severity.
- After ordinary rule text starts, semicolons remain literal text. The short form has no metadata parsing. Optional threshold metadata goes immediately after explicit severity.
- Duplicate declarations remain separate rules. Their IDs use the file's SHA-256 digest and source line number.

| Limit | Exact requirement |
| --- | --- |
| Encoding | Valid UTF-8 |
| File size | At most 64 KiB, or 65536 bytes |
| User rules | 1 through 16 declarations |
| Rule text | At most 4096 UTF-8 bytes after severity/metadata removal and trimming |

The count excludes built-in integrity. Empty declarations, no declarations, invalid encoding, exceeded limits or an unavailable file reject the whole policy. Tenet never silently truncates rules. The selected target must be a readable regular file.

### Choose explicit severity or metadata

These examples show a short blocking rule, a blocking rule with metadata and an advisory rule with metadata:

```tenet-policy
Rule; Never publish code to a remote repository without explicit approval.
Rule; BLOCK; evidenceThreshold=0.95; Never delete files outside the project directory.
Rule; WARN; evidenceThreshold=0.8; Ask before installing dependencies.
```

Use `WARN` when you want a finding without blocking or native approval. Explicit `BLOCK` is useful when adding metadata; it is not required for an ordinary blocking rule.

### Set a per-rule evidence threshold

Omit metadata to inherit `TENET_EVIDENCE_THRESHOLD`, default `0.9`. Both `BLOCK` and `WARN` rules can override it. Built-in integrity always uses the global value.

The case-sensitive `evidenceThreshold` token is reserved immediately after explicit severity. Use an unsigned decimal number from `0` through `1`, inclusive, followed by `;`. Decimal points need digits on both sides. Whitespace around the key and value is allowed:

```tenet-policy
Rule; BLOCK; evidenceThreshold = 0.95 ; Never delete files outside the project directory.
```

The whole policy is rejected for:

- An empty, signed, exponent, nonfinite or out-of-range value. For example, `-0.1`, `1e-1`, `.9` and `0.9.` are invalid.
- A missing separator, consecutive duplicate settings or empty rule text.

Differently cased keys are literal rule text, not settings. Rephrase older explicit-severity rule text that starts with this reserved token.

Outcome confidence remains global through `TENET_EFFECT_THRESHOLD`, default `0.9`. Lowering evidence confidence does not bypass `FAIL`, `UNKNOWN`, `INSUFFICIENT` or invocation-local approval. Scores equal to the threshold pass that score gate.

These scores are experimental signals, not calibrated safety guarantees. See [Configure thresholds](configuration.md#decision-and-evidence-settings) and [the assessment contract](assessment-contract.md).

## Check what a rule means

Rules are assessed individually. A rule that does not apply passes only through the assessment contract's validation gates. A loaded sentence is not necessarily assessable.

- "Never X without approval" can require confirmation. "Never X" prohibits X outright. In enforce mode, a `BLOCK` prohibition takes precedence over an approval condition. There is no majority vote or averaging across rules.
- A `WARN` rule reports findings without blocking or opening approval, even when it selects `FAIL` or `APPROVAL_REQUIRED`.
- A rule requiring prior tests can produce `UNKNOWN` when observed calls and results do not establish what ran. Ambiguous rules, omitted history and material redactions can stop a `BLOCK` action in enforce mode.

### Publication and commit examples

Under the publication example above, publication includes attempted uploads of source files or Git objects to any remote repository, including private repositories. Intermediate uploads before commit creation or reference updates count.

Local commits and preparation without upload do not count as publication. This rule alone is not a general outbound-data policy.

Under a Git commit prohibition, creating a commit differs from reading, editing or staging files. Saving a README edit is not a Git commit. A sequence that edits and then commits still attempts a commit.

Other rules and integrity apply independently. These meanings guide the evaluator; they are not tool exemptions or guarantees that the judge classifies correctly.

### Approval applies to one call

Enforcement allows only when all blocking rules and integrity satisfy their gates. Required native approval covers one unchanged pending invocation. Chat, task text, historical approvals and a previous approved call do not grant permission.

A retry needs fresh assessment and any required approval. A released call does not prove execution.

## Owner-only policy management and migration

Agent actions that modify, remove, replace, rename or redirect the active selected policy face a built-in integrity constraint. It covers the selected path and resolved target, including evidenced aliases and parent-directory replacement. Reading the policy is permitted.

In enforce mode, integrity blocks without an approval exception. User rules cannot weaken it. In observe mode, it reports without vetoing. Edit or migrate the policy yourself outside the intercepted agent path.

### Migrate from TENET_POLICY

`TENET_POLICY` no longer selects a policy. An override-only project becomes dormant in both modes, including enforce. Do not begin guarded work until its local policy is ready.

1. Review the intended policy yourself and place it at `TENET.md` in each session working directory, outside the guarded agent's intercepted path. Tenet does not copy or create it for you.
2. Remove `TENET_POLICY` from the environment that launches the host.
3. Run the offline doctor for that project and check the local source, digest and rule count. Resolve invalid setup before launch.
4. Restart the host process and verify native status in the eligible session before separately authorized live work. For Pi, use `/tenet status`.

Restoring the environment variable on the new version does not restore override support. Rollback requires the prior Tenet version and a process restart; existing recordings remain unchanged.

### Convert unprefixed prose to a rule

Existing unprefixed publication prose is no longer accepted. Tenet does not rewrite it. To migrate the original sentence, use:

```tenet-policy
Rule; Never publish code to a remote repository without explicit approval.
```

Unprefixed files report `policy-format`. Observe permits with unavailable coverage; enforce blocks until migration.

### Understand the checkout's policy

The repository's bundled `TENET.md` uses `evidenceThreshold=0.8` for its email rule. Publication and commit rules inherit the global default `0.9`, as does integrity.

This checkout policy is not an archive policy or fallback for other projects. Its no-commit rule forbids creating Git commits, not local reads, edits or staging. This grants no approval exception and changes no external owner policy.

The [TENET-3 historical handoff](TENET-3-handoff.md) records the original wording and paired synthetic replay. Scripted tests do not measure semantic accuracy.

### Reload after an owner change

Before enforce-mode release, Tenet checks that policy bytes and the resolved target match the loaded snapshot. Observe checks freshness before publishing a background finding.

A mismatch or read failure latches `policy-stale` and invalidates pending work. Enforce stays blocked until session-start reload or restart. Observe continues permitting calls with unavailable coverage and suppresses stale findings.

Changing the policy while confirmation is open does not authorize the pending action.

1. Review and edit the policy externally.
2. Use the session-start reload path for policy-file-only changes, or restart Pi.
3. Check the new policy digest and rule count in native status. Use a fresh call for any action that was pending.

Code and environment changes need a full process restart. Under Pi 0.85.1 and Bun 1.3.14, `/reload` and `/new` can retain old module imports.

Integrity is semantic protection, not filesystem isolation. Jev can misclassify actions, hidden aliases may be unknown, and Tenet cannot freeze the filesystem between checking and execution.

It cannot stop activity outside its hooks, including user-entered `!` commands, extension-internal execution and background subprocess activity. Stock Pi and Claude action resolution is unsupported. Pi installation does not verify the Claude prototype.

### Roll back grammar or threshold support

Review the target version before replacing Tenet. Restore the previous extension and use the supported short form `Rule; text` for policies that need its grammar. Make these changes externally, then restart.

Older versions ignore `TENET_MODE`, do not understand `WARN`/`BLOCK` metadata and block by default. Rollback does not preserve observation mode.

Before rolling back per-rule threshold support, remove threshold metadata from deployed policies. Older versions treat that segment as prose, not configuration. After removal, all rules use the global evidence threshold. See [archive removal and rollback](INSTALL-ARCHIVE.md#removal-and-rollback).

## Fix a rejected or unavailable policy

| Symptom | Next action |
| --- | --- |
| No footer or Tenet commands | Run doctor for the actual session directory. With no local file, the session is dormant in both modes. Author a policy externally, then start a new session or restart. For an older override setup, use the migration steps above. Also check extension load errors. |
| `policy-format` | Check case-sensitive prefixes, one-line declarations, UTF-8 and threshold grammar. Ordinary prose alone is not a policy. |
| `policy-file-limit`, `policy-rule-count-limit` or `policy-rule-size-limit` | Reduce the file, rule count or final rule text to the limits above. Nothing is truncated automatically. |
| `policy-unavailable` | Check the local path, regular-file target and read access outside the guarded agent. A broken local link is unavailable, not dormant. |
| `policy-stale` | Review the changed bytes and target externally, reload or restart, and check the new digest. Do not reuse a pending approval. |
| Valid policy but unavailable assessment | Check credentials and configuration with doctor. `ready` still does not verify the live provider or hooks. |
