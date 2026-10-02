# Operating the archive installation

Follow the [installation guide](../README.md) first. Pi loads `dist/pi/extension.js`, which registers the native guard and inspector command. The guard uses the same compiled SDK as standalone consumers.

## Eligibility and owner control

Tenet selects `TENET_POLICY` when set. Absolute paths remain absolute; relative paths resolve from the session working directory. Otherwise it selects only `TENET.md` in that directory, not parent directories or the installation directory. A missing implicit policy makes the session dormant. A present invalid policy, missing explicit policy, empty explicit override or missing credentials makes assessment unavailable. Observe permits calls without claiming a pass; enforce blocks unavailable assessment.

Write policy changes yourself outside the guarded tool path. Each active declaration starts with case-sensitive `Rule;`. `Rule; text` and `Rule; BLOCK; text` are blocking rules; `Rule; WARN; text` is advisory. Rules are line-based, including inside Markdown fences. A policy must be valid UTF-8, at most 64 KiB, with 1 to 16 rules and at most 4096 UTF-8 bytes per rule. Headings and ordinary prose are not rules.

`/tenet status` reports mode, activation, policy readiness, capture and declared host coverage. `/tenet` browses owner findings. `/tenet off` stops new assessment and capture through the cooperative control file at `~/.tenet/control.json`; `/tenet on` restores the process's existing mode. Other processes notice off asynchronously, and already released actions cannot be recalled. Previous recordings remain. A malformed or unsafe control file is unavailable, not a passing policy decision.

## Observation and enforcement

Observe is the default. It releases calls after bounded evidence capture and evaluates the fixed snapshot in the background. Pending, dropped, cancelled or unavailable work is not a pass. Findings remain owner-only, not agent messages or later evaluator evidence.

Only exact `TENET_MODE=enforce` selects enforcement, before process start. It waits for assessment and invocation-bound native owner confirmation when required. A confident PASS across blocking rules and integrity allows; an approval condition asks; prohibition, uncertainty, insufficient evidence or unavailable assessment blocks. WARN remains advisory. The global outcome and evidence thresholds default to 0.9. Rules may override evidence confidence with `Rule; BLOCK; evidenceThreshold=0.95; text`. Lower scores are not calibrated safety guarantees.

Policy-integrity findings cannot be approved. Changed policy bytes or target invalidate authorization; restart after externally reviewing the change. No live-mode mock fallback exists.

## Disclosure and limits

Assessed evidence and policy go to TypeSafe using `TYPESAFE_API_KEY`. Default capture saves submitted strings at `~/.tenet/recordings`. Field redaction cannot guarantee secret removal. `TENET_RECORDING=off` disables local capture, not provider submission or observation. `TENET_RECORDING_DIR` selects another absolute archive path. The inspector is read-only, loopback-only and unauthenticated; do not proxy it publicly.

Pinned Pi 0.85.1 tests prove native pre-release interception with harmless scripted calls. Pi declares interception, lifecycle invalidation and trusted approval. Result correlation and post-hook argument stability remain unsupported. Successful native tool results cannot certify execution in the new SDK-backed records; their execution status remains unknown. Stock Pi has no authenticated action resolver. Unknown host versions are not verified enforcement.

Tenet is not subprocess inspection, filesystem isolation or an OS sandbox. Semantic judgments can be wrong, hidden aliases can remain unknown, and same-user processes can change control state or access evidence. Actions outside the hooks are not covered. Claude Code is an unverified prototype and is not part of this delivery.

The [SDK guide](sdk.md) describes host obligations and recorded contract versions. The [repository documentation](https://github.com/koenvg/Tenet#readme) contains the full configuration reference and historical evaluation limits. This archive's offline checks do not measure live evaluator accuracy.
