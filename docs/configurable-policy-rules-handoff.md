# Configurable policy rules handoff

## Implementation complete

Change: `add-configurable-policy-rules` (spec-driven). **16/16 tasks complete.** The owner explicitly authorized the agent to perform the one-line bundled policy migration after the 14/16-task checkpoint. The migrated root policy was verified to contain exactly the intended publication rule, and all checks below were rerun successfully. No commits were made and no live Jev calls were made for this change.

The implementation now loads explicit `Rule;` declarations, creates immutable bounded policy snapshots, assesses every rule plus a built-in policy-integrity constraint in one SDK request, validates complete structured answers, and aggregates PASS / APPROVAL_REQUIRED / FAIL / UNKNOWN conservatively. Pi confirmation lists all approval-requiring rules, stays invocation-local, and cannot override failure or uncertainty. Freshness checks compare the policy digest and resolved target before release; a mismatch blocks until reload. Startup and version-2 audit records identify `policy-rules-v1`.

## Policy migration

The owner explicitly requested and authorized the agent to update the root `TENET.md`. Its policy sentence was migrated to:

```text
Rule; Never publish code to a remote repository without explicit approval.
```

The surrounding prose is unchanged and is not itself an enforced rule. This was a one-time owner-authorized source-file migration, not a change to runtime policy integrity. No confirmation override or migration bypass was added to the guard.

The new generic question contract needs a full Pi process restart. Check `policy-rules-v1`, the expected rule count and policy digest in startup status. Policy-file-only owner changes can use the documented session-start reload path. Do not make live calls merely to finish offline verification.

## Final verification

| Command | Result |
| --- | --- |
| `bun test` | 50 tests passed across 6 files |
| `bun run smoke` | 2 tests passed |
| `bun run typecheck` | Passed |
| `openspec validate add-configurable-policy-rules --strict` | Passed |
| `git diff --check` | Passed |

Policy, decision, SDK and Pi tests were run failing before the corresponding changes, then made green. README policy examples are parsed in temporary files without touching the active policy. Smoke tests use the actual pinned Pi loader and dispatcher, scripted assistant/Jev responses and dummy executors; policy-integrity failures and uncertainty never reach those executors.

These are offline enforcement and transport checks. Generic-rule prompt quality, repeated-call stability, model latency at maximum rule count and terminal keyboard behavior have not been measured live. Old v3 JSON reports are unchanged historical publication evidence; the updated diagnostic explicitly refuses their obsolete question override rather than presenting it as compatible with the generic contract.

## Limits and follow-up

- Built-in policy integrity is a semantic veto, not an OS sandbox. Hidden aliases, unobserved subprocess behavior and filesystem races remain limitations. Owner changes are not attributed by identity; any observed snapshot mismatch blocks.
- Both probability thresholds remain 0.90; the complete assessment deadline remains 2500 ms with no retries. Rule count is capped at 16, source size at 64 KiB, and rule text at 4096 UTF-8 bytes. These bounds are not live latency or correctness guarantees.
- Rule text and trusted path/cwd context reach TypeSafe. Rule text is not secret-scanned; field redaction cannot catch every embedded secret.
- Concurrent UI serialization, full session/branch/reload invalidation, trajectory and adversarial/live evaluation remain outside this change. A successful permission or tool result is not independent proof of remote effects.
- The earlier `add-semantic-publication-guard` change remains at 7/22 tasks. Its publication-only delta specs overlap this successor, and the main spec inventory is empty. Reconcile those deltas before archiving into a shared baseline; do not mark deferred work complete.
- Rolling back requires the owner to restore the older software and policy format externally, then restart. Additional user rules are not enforced by the old publication-only implementation.
