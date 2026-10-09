# Configure Tenet for a Pi process

Use this guide to configure a built developer checkout. Archive owners should use the shipped [operation guide](ARCHIVE-OPERATION.md). Set process options in the launch shell and select the judge in `~/.tenet/config.json`.

## Apply and check a setting

Before owner-file changes or live launch, obtain separate authorization for disclosure of full policy, paths, tool evidence and bounded observations. TypeSafe uses API quota; APUS through forwarding sends the data to Pika and uses its CPU.

Secrets can survive redaction and enter local recordings or backend logs. `TENET_RECORDING=off` stops only new local capture.

Observe never blocks execution or opens approval. Tenet is not a sandbox, and Pi installation does not establish coverage in other hosts.

1. Choose the settings below. Manage owner files yourself outside the guarded agent path. This supported offline example sets the launch environment, from any directory:

   ```sh
   export TENET_MODE=observe
   export TENET_RECORDING=off
   ```

2. Build the SDK/CLI and inspector using [development setup](../CONTRIBUTING.md#set-up). From your project directory, replace the installation path and run doctor in the same environment:

   ```sh
   TENET_DIR=/absolute/path/to/tenet
   node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD"
   ```

   Doctor sends no evidence or writes. Correct its reported issues; `ready` means local readiness, not valid credentials, connectivity or active hooks.
3. Fully restart Pi after settings, environment or code changes. `/reload`, `/new` and on/off do not reload process configuration.
4. Run read-only `/tenet status` in an eligible session. Check judge, settings state, effective limits, mode, policy readiness, activation and capture.

## Owner settings and provider selection

Tenet reads `~/.tenet/config.json` from the launching process's absolute `HOME`, or the operating system home if `HOME` is unset. It applies across that owner's projects on that machine. Project files, `TENET_POLICY` and SDK `env.HOME` cannot redirect it.

For Mac Pi with a Pika evaluator, keep the file on the Mac. APUS `baseUrl` names the Mac's loopback forwarding listener; Tenet starts neither the tunnel nor server:

```text
Mac Pi + owner config -> Mac loopback -> private SSH forwarding -> Pika APUS
```

Version 1 requires numeric `version: 1` and `judge`; optional fields are `decision.deadlineMs` and `observation.running`, `waiting`, `bytes`, `ageMs`. Unknown fields and wrong types are invalid. Policy, mode, credentials and capture use separate controls.

| Provider | Required `judge` fields | Requirements |
| --- | --- | --- |
| Supported TypeSafe | `provider: "typesafe"` only | `TYPESAFE_API_KEY` in the environment |
| Experimental APUS | `provider: "apus-llamacpp"`, `baseUrl`, `model` | Literal HTTP loopback `127.0.0.1` or `[::1]`, explicit port, expected model alias; no TypeSafe key or quota |

Use private, same-owner `.tenet` and `config.json`, normally `0700` and `0600` on POSIX. The file must be owner-readable, regular, single-link, valid UTF-8 JSON and at most 32768 bytes, with no symlinks anywhere in its path. Tenet neither creates, repairs nor watches it.

The deadline uses the environment override, then the file value, then `2500` ms. No environment switch selects the provider or overrides observation queue limits. Each guard freezes settings, including invalid results, for pending work and new sessions; edits require a full process restart.

Confirmed file absence selects TypeSafe with built-in limits, subject to environment overrides. Invalid input makes assessment unavailable, not a provider fallback. Global/project `TENET.md` files supply policy rules; `control.json` supplies live cooperative on/off.

For offline JSON examples and field validation, read [the settings schema](judge.md#version-1-schema). For queue defaults, numeric bounds and SDK overrides, read [limits and precedence](judge.md#defaults-limits-and-precedence). For separately authorized deployment, use [the unverified private Pika plan](judge.md#plan-private-pika-setup).

APUS scores do not establish calibration or enforcement safety.

## Mode, policy and credentials

| Variable | Default | Accepted values and effect |
| --- | --- | --- |
| `TENET_MODE` | `observe` | Exact `observe` or `enforce`; only `enforce` blocks. Invalid values select observe and report `invalid-mode`. |
| `TENET_POLICY` | Unset | Project policy path, absolute or session-relative. Empty/whitespace values are invalid; missing or unusable selected files have no fallback. |
| `TYPESAFE_API_KEY` | None | Nonblank key for TypeSafe only. Use your secret manager, never JSON, policy, source, chat or command arguments. APUS does not send it. |

Optional owner `~/.tenet/TENET.md` applies alongside session `TENET.md`. `TENET_POLICY` replaces only the project candidate. Both implicit files absent without an override means dormant; unusable sources invalidate the whole set. For selection, stale sources and reload rules, read [policy selection](policy.md#choose-the-policy-file).

Doctor reads owner settings and process environment, not dotenv files, secret managers or Pi settings. It checks credential presence only.

## Decision and evidence settings

| Variable | Default | Valid range and effect |
| --- | --- | --- |
| `TENET_EFFECT_THRESHOLD` | `0.90` | Finite `0` through `1`; minimum selected outcome probability. |
| `TENET_EVIDENCE_THRESHOLD` | `0.90` | Finite `0` through `1`; minimum P(SUFFICIENT) where applicable. User rules can override it; integrity cannot. |
| `TENET_JUDGE_DEADLINE_MS` | File value, else `2500` | Finite `> 0`, at most `2147483647`; whole-assessment deadline in ms. Environment may be fractional; JSON must be an integer. |
| `TENET_APPROVAL_TIMEOUT_MS` | `60000` | Integer `1` through `2147483647` ms, including dialog queue time. |
| `TENET_RECENT_EVENTS` | `12` | Safe integer `0` through `9007199254740991`; maximum recent observations. `0` omits history. |
| `TENET_EVIDENCE_MAX_BYTES` | `24576` | Safe integer `1` through `9007199254740991`; serialized judge-state UTF-8 byte limit. |
| `TENET_SENSITIVE_FIELDS` | `[]` | JSON array of additional nonblank string field names to redact from copied evidence. |

Unset values use defaults. Empty/whitespace numeric values are invalid; other numeric strings use JavaScript `Number` before range validation. Invalid environment or file values fail rather than falling back.

Probabilities are experimental, not calibrated guarantees. Lower thresholds do not bypass selected `FAIL`, `UNKNOWN`, `INSUFFICIENT`, approval or authenticated-fact requirements. For score boundaries and outcome gates, read [observation and enforcement](ARCHIVE-OPERATION.md#observation-and-enforcement); for rule-specific settings, read [per-rule thresholds](policy.md#set-a-per-rule-evidence-threshold).

### Bound recent evidence

History is capped at one third of the state budget; each event's data at one quarter of that allowance. Missing history never proves execution. If protected evidence cannot fit, assessment is insufficient without a provider request. For accounting and UTF-8 excerpts, read [evidence budgets](inspection-evidence.md#check-the-budgets).

### Remove named sensitive fields

Matching ignores case, hyphens, underscores and whitespace. Redaction changes copied evidence, not executor arguments; built-in credential removal remains even with `[]`. Embedded secrets and policy text are not fully secret-scanned, so review submissions yourself.

## Local capture and shared owner control

| Variable | Default | Accepted values and effect |
| --- | --- | --- |
| `TENET_RECORDING` | `on` | Exact `on` or `off`. Invalid values disable capture with `invalid-recording-setting`. |
| `TENET_RECORDING_DIR` | `~/.tenet/recordings` | Absolute path. Empty/relative values disable capture with `invalid-recording-directory`, even when recording is off. |
| `TENET_CONTROL_PATH` | `~/.tenet/control.json` | Absolute path. Empty/relative values prevent normal initialization. |
| `BB_THREAD_ID` | Unset | Archive-routing hint matching `^thr_[a-z0-9]{8,64}$`; invalid values are ignored. It changes neither session keys nor decisions. |

Default `~` means the owner's home; explicit environment paths must be actual absolute paths. Capture paths must have no symlink components and use private directories/files, normally `0700`/`0600`. Unsafe paths disable writes, not enforcement.

Recordings are unencrypted, best-effort diagnostics with no automatic expiry. Off and uninstall do not erase them. Stop writers and the inspector before deletion; read [storage and disclosure limits](ARCHIVE-OPERATION.md#disclosure-and-limits).

### Use on/off without changing mode

In an eligible Pi session, `/tenet off` skips new assessments, approvals, trajectory capture and recording. `/tenet on` restores the process's existing mode and recording settings, not enforce or dormant activation. These commands change cooperative same-user control, not settings or OS security.

A fresh missing control defaults to on. Unsafe or unreadable control prevents assessment and recording. Other processes notice through notifications and a 250 ms refresh loop; already released actions cannot be recalled and pending archive writes can finish after off.

For private-file requirements, cancellation races and repair, read [the cooperative switch](ARCHIVE-OPERATION.md#use-the-cooperative-onoff-switch). For installed Claude bridge limits, read [the host boundary](ARCHIVE-OPERATION.md#know-the-host-boundary).

## Invalid-setting behavior

For active eligible sessions, unavailable assessment blocks in enforce and permits without a pass in observe. Off/dormant runtime bypasses remain.

| Problem | Result and next action |
| --- | --- |
| Invalid mode, owner settings, guard setting or selected policy | Doctor `invalid`, exit `1`, including off/dormant. Correct the reported issue and restart. |
| Missing TypeSafe key with TypeSafe selected | Active doctor `unavailable`, exit `1`. Configure the key securely; coherent off/dormant can exit `0`. |
| Invalid recording setting/path | Capture disabled; guard permission unchanged. Doctor `invalid`, exit `1`. |
| Unsafe/unreadable control | No assessment or recording. Fix permissions/links externally; repair safe malformed content with native on/off. Doctor `invalid`, exit `1`. |
| Both implicit policies absent, no override | Dormant with no active Tenet status or assessment. Doctor exits `0` if other prerequisites are coherent. |

Invalid setup takes precedence over unavailable and bypass states; doctor off takes precedence over dormant. Incomplete installation or a detected untested Pi version still fails when off/dormant. Read [doctor states and exits](doctor.md#states-and-exits) for precedence and bounded issue codes.

## Provider settings that are not switches

TypeSafe fixes `https://api.typesafe.ai`, `jev-latest`, disabled SDK logging and no retries. `jev-latest` is an alias, not an immutable release. Records preserve requested/returned model identity; late responses cannot change blocked decisions.

Neither provider has a live-mode mock fallback. For APUS protocol and cancellation limits, read [the native contract](judge.md#pinned-native-assessment-contract).

## Fix a setting that has no effect

- Old settings: fully close Pi and relaunch from the configured shell.
- No status: check policy selection and extension load errors. On/off cannot activate dormant sessions.
- Ready but unavailable: check provider connectivity and hooks. For APUS, check forwarding and model alias, not the TypeSafe key. Live checks need separate authorization for evidence disclosure to the selected service.

Report bounded issue codes, not secrets or raw environment dumps.
