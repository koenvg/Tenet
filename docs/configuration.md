# Configure Tenet for a Pi process

Use this checkout reference to look up environment settings, defaults and failure behavior. Set them in the shell that launches Pi. The [archive operation guide](ARCHIVE-OPERATION.md) keeps the required settings within the shipped archive.

Choose the setting for your task:

- For a first launch, use [mode, policy and credentials](#mode-policy-and-credentials).
- To tune a gate or evidence budget, use [decision and evidence settings](#decision-and-evidence-settings).
- To stop capture or assessment, use [local capture and shared owner control](#local-capture-and-shared-owner-control).
- If setup is rejected, use [invalid-setting behavior](#invalid-setting-behavior).

## Apply and check a setting

A real assessed action sends policy, paths, tool evidence and bounded recent observations to TypeSafe and uses quota. Local capture is on by default and can retain secret-bearing submitted strings. `TENET_RECORDING=off` disables only new local capture. It does not prevent provider disclosure or disable observation and native findings.

Observe never vetoes or opens approval, including on invalid configuration, missing credentials, timeouts or integrity findings. Tenet is not an OS sandbox. Pi installation and enforcement do not establish coverage in the unverified Claude prototype or outside Pi's hooks.

1. Choose the setting below and set it before launching Pi. For example, to start in observation without new local capture:

   ```sh
   export TENET_MODE=observe
   export TENET_RECORDING=off
   ```
2. Run the compiled offline doctor in the same environment. Replace `/absolute/path/to/tenet` and run from your project directory:

   ```sh
   TENET_DIR=/absolute/path/to/tenet
   node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD"
   ```

   A checkout needs its SDK/CLI and inspector built first. An installed archive needs no build. See [Run doctor](doctor.md#direct-invocation).
3. Correct invalid settings, then close and restart Pi. Code and environment changes require a full process restart. `/reload` and `/new` can retain old module imports under Pi 0.85.1 and Bun 1.3.14.
4. Run `/tenet status` in an eligible session. Check mode, policy readiness, activation and effective capture. Doctor's `ready` means local readiness, not provider connectivity or active hooks.

## Mode, policy and credentials

| Variable | Default | Accepted value and effect |
| --- | --- | --- |
| `TENET_MODE` | `observe` | Exact `observe` or `enforce`. Only exact `enforce` enables blocking. Mode is fixed for the process; restart to change it. Invalid values select observe and report `invalid-mode`. |
| `TENET_POLICY` | Unset | Absolute or session-cwd-relative path. When set, selects an eligible policy even if the file is missing. Empty or whitespace-only values are invalid. |
| `TYPESAFE_API_KEY` | None | Required nonblank TypeSafe credential for live assessment. Set it through your secret manager, never in policy, source, chat or command-line arguments. Doctor checks presence only. |

Without `TENET_POLICY`, only `TENET.md` in the session working directory makes the session eligible. No parent search or bundled fallback occurs. A missing local file makes both modes dormant. A present invalid file or missing explicit path makes assessment unavailable. Policy deletion after activation is unavailable, not dormant. See [Policy selection and grammar](policy.md#choose-the-policy-file).

Doctor reads process environment. It does not load dotenv files, query a secret manager or inspect Pi settings.

## Decision and evidence settings

| Variable | Default | Valid range and meaning |
| --- | --- | --- |
| `TENET_EFFECT_THRESHOLD` | `0.90` | Finite number from `0` through `1`, inclusive. Minimum selected per-rule outcome probability. The name is retained. |
| `TENET_EVIDENCE_THRESHOLD` | `0.90` | Finite number from `0` through `1`, inclusive. Minimum P(SUFFICIENT) where the evidence-confidence gate applies. User rules can override it; integrity cannot. |
| `TENET_JUDGE_DEADLINE_MS` | `2500` | Finite number greater than `0` and at most `2147483647`. Overall judge deadline, not per-rule. It need not be an integer. Human approval time is separate. |
| `TENET_APPROVAL_TIMEOUT_MS` | `60000` | Safe integer from `1` through `2147483647`, inclusive. Native approval deadline includes time waiting in the dialog queue. |
| `TENET_RECENT_EVENTS` | `12` | Nonnegative safe integer, at most `9007199254740991`. Maximum recent observations. `0` omits all history. |
| `TENET_EVIDENCE_MAX_BYTES` | `24576` | Positive safe integer, at most `9007199254740991`. Maximum UTF-8 bytes of serialized judge state. |
| `TENET_SENSITIVE_FIELDS` | `[]` | JSON array of additional nonblank string field names to remove recursively from copied evidence. `[]` adds no names. |

Unset numeric settings use defaults. Explicit empty or whitespace-only values are invalid. The runtime converts nonempty numeric settings with JavaScript `Number`, then applies the ranges above. This differs from the stricter unsigned-decimal grammar for policy `evidenceThreshold` metadata.

Thresholds do not change semantic instructions. Scores equal to a threshold pass that score gate. A selected `FAIL` still blocks even below threshold. `UNKNOWN`, `INSUFFICIENT` and invocation-local approval are not bypassed by lower thresholds.

Only complete, current host-authenticated facts can support `NOT_APPLICABLE`; its selected-outcome threshold still applies, but its evidence-confidence gate does not. Stock adapters do not supply that action resolution. See [the assessment contract](assessment-contract.md) and [per-rule thresholds](policy.md#set-a-per-rule-evidence-threshold).

These probabilities are experimental signals, not calibrated correctness guarantees. A low-confidence `PASS` is uncertainty, not a detected violation. No averaging or majority vote combines rule scores.

### Bound recent evidence

Optional history has a separate allowance of one third of the serialized state budget. Each event's complete data is at most one quarter of that history allowance. Defaults give 8 KiB for history and 2 KiB per event. Envelopes and metadata count toward these budgets.

The selector prefers newer call/result groups, shortens before dropping whole groups and preserves provenance. Large strings use UTF-8-safe head/tail excerpts with original sizes and ranges. Missing history never proves execution or success.

If protected current state or the minimal history envelope cannot fit, assessment reports insufficient evidence without asking Jev. This vetoes only in enforce mode. For selection and admission limits, see [inspection evidence](inspection-evidence.md#check-the-budgets).

### Remove named sensitive fields

From the launching shell, for example:

```sh
export TENET_SENSITIVE_FIELDS='["customerSecret","internalPayload"]'
```

Matching ignores case, hyphens, underscores and whitespace. Tenet removes matching fields recursively from copied evidence, not from executor arguments. Recognized credential fields remain removed even when this setting is `[]`.

Empty strings, malformed JSON, nonarrays and entries that are not nonblank strings are invalid configuration. Field redaction does not find all secrets in shell commands, source, URLs, metadata or encoded values. Rule text is not secret-scanned. Review what you submit.

## Local capture and shared owner control

| Variable | Default | Accepted value and effect |
| --- | --- | --- |
| `TENET_RECORDING` | `on` | Exact `on` or `off`. `off` disables new local archive capture, not provider submission or native findings. Invalid values disable capture and report `invalid-recording-setting`. |
| `TENET_RECORDING_DIR` | `~/.tenet/recordings` | Absolute directory path. Relative or empty values disable capture and report `invalid-recording-directory`. This is checked even when recording is off. |
| `TENET_CONTROL_PATH` | `~/.tenet/control.json` | Absolute path for the cooperative same-user control file. A relative or empty path prevents normal runtime initialization. |
| `BB_THREAD_ID` | Unset | Optional archive-routing hint. Accepted IDs match `^thr_[a-z0-9]{8,64}$`. Invalid values are ignored. It does not alter Pi session keys or policy decisions. |

Default `~` paths mean the user's home directory. They are not instructions to pass an unexpanded tilde as an environment value. Set explicit paths to actual absolute paths.

Recording settings are separate from guard configuration. Invalid capture settings disable capture without changing enforcement, approval or permission. Doctor still reports them as invalid setup, including when dormant or off.

Unsafe archive paths also disable writes rather than being silently repaired. Paths must have no symlink components; existing archive directories must be owner-only.

Directories use `0700` and files `0600`. Storage is unencrypted and does not protect against another process running as you.

Capture can fail from unsafe directories, full disk or queue loss. Records are best-effort diagnostics, not a transactional audit log.

Recording has no automatic expiry. Off and uninstall do not erase old evidence. Stop all writers and the inspector before removing retained evidence. See [archive disclosure and limits](ARCHIVE-OPERATION.md#disclosure-and-limits).

### Use on/off without changing mode

In an eligible Pi session:

```text
/tenet status
/tenet off
/tenet on
```

`/tenet status` is read-only. `/tenet off` persists a machine-wide choice and skips new assessments, approvals, trajectory capture and recording. `/tenet on` restores each process's existing `TENET_MODE` and `TENET_RECORDING` settings. It neither selects enforce nor activates a dormant session. Both commands are safe to repeat.

A fresh missing control file defaults to on. Existing controls must be private same-user files and directories without unsafe links.

A corrupt or unreadable control shows `TENET CONTROL UNAVAILABLE` in eligible sessions. Enforce blocks; observe permits without assessing or recording.

Repair a safe malformed file with native `/tenet on` or `/tenet off`. Fix unsafe permissions or symlinks outside Pi. Doctor never repairs control.

The issuing process cancels pending assessments before off reports success. Other processes notice through notifications and a 250 ms refresh loop. The command does not wait for them.

Calls can finish before they notice; already released or dispatched calls cannot be recalled. A change between the final check and dispatch can still race.

This is a cooperative switch, not an OS security boundary. Same-user agents or processes can change or remove the file. Removing it lets fresh processes default to on.

Pending archive writes can finish after off. The same switch applies to an explicitly installed local Claude bridge, but Pi installation does not install or verify Claude coverage.

## Invalid-setting behavior

| Condition | Runtime behavior | Doctor behavior |
| --- | --- | --- |
| Invalid `TENET_MODE` | Selects observe and reports `invalid-mode`. It does not silently enforce. | `invalid`, exit `1` |
| Invalid guard setting in an eligible session | Assessment unavailable with `configuration`. Observe permits without a pass; enforce blocks. | `invalid`, exit `1`, even if off or dormant |
| Missing credential in an active eligible session | Assessment unavailable. Observe permits; enforce blocks. | `unavailable`, exit `1`, unless invalid setup takes precedence |
| Invalid recording setting/path | Capture disabled with an issue. Guard permission is unchanged. | `invalid`, exit `1` |
| Unreadable or unsafe control | No new assessment or recording. Observe permits; enforce blocks in an eligible session. | `invalid`, exit `1` |
| No local policy and no override | Dormant in either mode, no Tenet UI or assessment | `dormant`, exit `0`, if other local prerequisites are coherent |

Off takes precedence over dormancy in doctor. Invalid setup takes precedence over unavailable delivery/compatibility and bypass states. Missing credentials remain visible but do not fail coherent off/dormant states. An incomplete installation or detected untested Pi version still fails when off or dormant. See [Doctor states and exits](doctor.md#states-and-exits).

## Provider settings that are not switches

The TypeSafe client uses the official endpoint `https://api.typesafe.ai`, model `jev-latest`, disabled SDK logging and no retries. The model name is a provider alias, not an immutable release.

Records retain requested and returned model identities. Cancellation reaches the SDK; a late response cannot change a blocked decision.

Tenet explicitly sets these client options. There is no live-mode mock fallback or supported environment switch to change this request contract.

## Fix a setting that has no effect

- If mode or capture still shows the old value, close the entire Pi process and relaunch from the configured shell. Do not rely on `/reload` for environment changes.
- If no status appears, check policy selection and extension load errors. On/off cannot activate a dormant session.
- If doctor says invalid, use its bounded issue code and the ranges above. Do not paste secrets or raw environment dumps into reports.
- If doctor says ready but an action is unavailable, credential validity, provider reachability and hook activation remain unverified. Any live check needs separate authorization and discloses evidence to TypeSafe.
