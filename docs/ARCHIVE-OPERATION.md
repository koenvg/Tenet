# Operating the archive installation

Follow the [installation guide](../README.md) first. Pi loads `dist/pi/extension.js`, which registers the native guard and inspector command. The guard uses the same compiled SDK as standalone consumers.

## Eligibility and owner control

Tenet selects `TENET_POLICY` when set. Absolute paths remain absolute; relative paths resolve from the session working directory. Otherwise it selects only `TENET.md` in that directory, not parent directories or the installation directory. A missing implicit policy makes the session dormant. A present invalid policy, missing explicit policy, empty explicit override or missing credentials makes assessment unavailable. Observe permits calls without claiming a pass; enforce blocks unavailable assessment.

Write policy changes yourself outside the guarded tool path. Each active declaration starts with case-sensitive `Rule;`. `Rule; text` and `Rule; BLOCK; text` are blocking rules; `Rule; WARN; text` is advisory. Rules are line-based, including inside Markdown fences. A policy must be valid UTF-8, at most 64 KiB, with 1 to 16 rules and at most 4096 UTF-8 bytes per rule. Headings and ordinary prose are not rules.

`/tenet status` reports mode, activation, policy readiness, capture and declared host coverage. `/tenet` browses owner findings. `/tenet off` stops new assessment and capture through the cooperative control file at `~/.tenet/control.json`; `/tenet on` restores the process's existing mode. Other processes notice off asynchronously, and already released actions cannot be recalled. Previous recordings remain. A malformed or unsafe control file is unavailable, not a passing policy decision.

## Troubleshooting

Run the delivered doctor outside Pi with `node "$TENET_DIR/dist/cli/index.js" doctor --project /absolute/path/to/project`. Use the same shell environment as your next launch. Doctor never starts hooks or submits evidence.

| Symptom | What to check |
| --- | --- |
| No footer or `/tenet` command | A missing local policy with no override is dormant. Registration supplies no policy. Check the selected cwd with doctor, author policy externally and restart. If policy exists, check `pi list` and extension load errors. A load error means no Tenet hook. |
| Invalid or broken active policy | A present malformed file, missing explicit path, empty override or stale policy is unavailable, not dormant. Use valid UTF-8 `Rule;` lines, review the selected path outside the agent and restart. Observe permits without a pass; enforce blocks. |
| Missing credentials or provider errors | Configure `TYPESAFE_API_KEY` securely before relaunch. Doctor tests presence only. A key can still be invalid, the provider unreachable or an assessment timed out. None is an all-clear; a live request needs separate authorization. |
| `TENET OFF` or `CONTROL UNAVAILABLE` | `/tenet on` restores the current process mode; it does not select enforce. Fix unsafe permissions or links outside Pi. A malformed safe control can be repaired by native on/off. Other running processes notice changes asynchronously. |
| Pending or lost findings | Check `/tenet status` for completed, unavailable, dropped, cancelled and cumulative loss counts. Two assessments can run and 32 can wait; waiting snapshots expire after five seconds. Turn end need not cancel observation, but off, stale policy and shutdown can. A crash can leave incomplete records. Absence of a report is not PASS. |
| Native findings but no inspector history | `TENET_RECORDING=off` leaves native reporting on. Otherwise check the capture location and loss/drain counts. Unsafe directories, full disk or queue loss can prevent capture without changing permission. Stop writers before repairing storage. Old evidence remains separately readable. |
| Partial or missing inspector stages | Check indexing, unsupported-schema and corrupt-file notices; allow later polls for indexing. Missing assessment or result is unknown, not execution proof. Recording is best-effort, not a transactional audit log. |
| Doctor says ready but coverage is unknown | Ready is local setup only. Pin Pi 0.85.1, fully restart and verify `/tenet status`. Unknown metadata stays unknown; a detected untested version reports unavailable compatibility. Provider validity and active hooks remain unverified by doctor. |

Known post-hook limits still apply even when native status is on. Tenet rechecks before releasing permission, but Pi cannot freeze arguments after that hook or correlate native results to an exact SDK invocation. Keep Tenet after argument-mutating hooks; later hooks and executors must honor the assessed action. User-entered `!` commands, extension-internal execution and background subprocess behavior are outside coverage. Stock Pi has no authenticated action resolver. Tenet is not an OS sandbox, and Claude Code is not verified by this path.

## Observation and enforcement

Observe is the default. It releases calls after bounded evidence capture and evaluates the fixed snapshot in the background. Pending, dropped, cancelled or unavailable work is not a pass. Findings remain owner-only, not agent messages or later evaluator evidence.

Only exact `TENET_MODE=enforce` selects enforcement, before process start. It waits for assessment and invocation-bound native owner confirmation when required. A confident PASS across blocking rules and integrity allows; an approval condition asks; prohibition, uncertainty, insufficient evidence or unavailable assessment blocks. WARN remains advisory. The global outcome and evidence thresholds default to 0.9. Rules may override evidence confidence with `Rule; BLOCK; evidenceThreshold=0.95; text`. Lower scores are not calibrated safety guarantees.

Policy-integrity findings cannot be approved. Changed policy bytes or target invalidate authorization; restart after externally reviewing the change. No live-mode mock fallback exists.

## Disclosure and limits

Assessed evidence and policy go to TypeSafe using `TYPESAFE_API_KEY`. Default capture saves submitted strings at `~/.tenet/recordings`. Field redaction cannot guarantee secret removal. `TENET_RECORDING=off` disables local capture, not provider submission or observation. `TENET_RECORDING_DIR` selects another absolute archive path. The inspector is read-only, loopback-only and unauthenticated; do not proxy it publicly.

Pinned Pi 0.85.1 tests prove native pre-release interception with harmless scripted calls. Pi declares interception, lifecycle invalidation and trusted approval. Result correlation and post-hook argument stability remain unsupported. Successful native tool results cannot certify execution in the new SDK-backed records; their execution status remains unknown. Stock Pi has no authenticated action resolver. Unknown host versions are not verified enforcement.

Tenet is not subprocess inspection, filesystem isolation or an OS sandbox. Semantic judgments can be wrong, hidden aliases can remain unknown, and same-user processes can change control state or access evidence. Actions outside the hooks are not covered. Claude Code is an unverified prototype and is not part of this delivery.

The [SDK guide](sdk.md) describes host obligations and recorded contract versions. The [repository documentation](https://github.com/koenvg/Tenet#readme) contains the full configuration reference and historical evaluation limits. This archive's offline checks do not measure live evaluator accuracy.
