# Diagnose a project before starting Pi

Run doctor to check local setup offline. It checks the selected project and the installation containing the compiled CLI. It does not prove that Pi hooks are active or that the selected judge is reachable.

Doctor does not start Pi or a guard session, execute tools, open approval, watch files, create recordings or change policy, settings, control or credentials. It does not construct a provider client. It sends no evidence and does not probe writability by creating files.

## Direct invocation

### Run the delivered archive CLI

First install the archive's locked production dependencies. No checkout build or global `tenet` command is needed. Use Node 22.19+ for the tested Pi archive path, or Bun 1.3.14+.

1. Set `TENET_DIR` to your stable installation, then go to your project. Replace both absolute-path placeholders:

   ```sh
   TENET_DIR=/absolute/path/to/tenet
   cd /absolute/path/to/project
   ```

2. Run the real compiled CLI in the environment the next Pi process will inherit:

   ```sh
   node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD"
   ```

3. For structured output, use either runtime:

   ```sh
   node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD" --json
   bun "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD" --json
   ```

If you omit `--project`, doctor uses the current directory. The installation checked is the one containing this CLI, not the project. See the archive's [root installation guide](../README.md), or the [repository archive guide](https://github.com/koenvg/Tenet/blob/main/docs/INSTALL-ARCHIVE.md) when reading from a checkout.

### Prepare a development checkout

This is the checkout-only path. From the repository root, with Bun 1.3.14+ and Node 22.19+ for pinned Pi development/archive checks:

```sh
bun install --frozen-lockfile
bun run sdk:build
bun run inspector:build
```

Then run the compiled `dist/cli/index.js` through the direct commands above. Do not substitute `src/cli/index.ts` for the delivered command. SDK-only consumers support Node 22.12+, but that does not lower the tested Pi/archive requirement.

Doctor reads process environment and the private owner `~/.tenet/config.json`, not dotenv files, a secret manager or Pi settings. For TypeSafe, configure `TYPESAFE_API_KEY` securely through your existing secret manager. Never put credentials in policy, settings JSON or command-line arguments.

Presence is not proof of validity. After running doctor, use [states and exits](#states-and-exits) to read the result, or [setup fixes](#fix-invalid-or-unavailable-setup) for a failure.

## States and exits

| State | Meaning | Exit |
| --- | --- | --- |
| `ready` | Policy and active local prerequisites are valid | `0` |
| `off` | Owner-selected cooperative control is off | `0` |
| `dormant` | Confirmed absence of both implicit global and project candidates, with no override | `0` |
| `invalid` | Project, selected policy, configuration or control is invalid/unreadable | `1` |
| `unavailable` | Delivery is incomplete, detected Pi version is untested, or the active selected judge is unavailable | `1` |

Expected text output starts with `TENET doctor: ready (local setup only)` for coherent active setup. All reports say `assessment: not-requested`; no state is an assessed permission. Off and dormant bypass assessment and are not passes.

### When more than one state applies

- Invalid prerequisites take precedence over unavailable delivery/compatibility and bypass states.
- Incomplete delivery or a detected untested Pi version fails even when off or dormant.
- Missing credentials remain a visible limitation but do not fail coherent off/dormant states.
- Off takes precedence over dormancy when both apply.

JSON uses `schemaVersion: 2`. Policy output uses `policy-sources-v1` with candidates, source summaries, combined digest, rule count, validation and any reason/failed role.

The report also includes `state`, `exitCode`, configuration, safe effective `settings`, mode, control, local `judge` readiness, credentials, capture, delivery, compatibility, issues and limitations. `hooks` and `provider` stay `unverified`.

`judge` uses the same local preparation contract as the SDK and Pi owner disclosure. The default reports `provider: 'typesafe'`, `requestedModel: 'jev-latest'` and `connectivity: 'unverified'`.

TypeSafe's `availability` is `ready` when its credential is present, otherwise `unavailable` with `reason: 'missing-credentials'`. Valid APUS settings report the configured alias and `experimental: true` without a TypeSafe-key requirement. APUS can report local `ready` availability. It makes no TypeSafe fallback request; doctor does not test its backend.

`settings` reports source, validation state, effective deadline and queue limits without file contents or destination. Invalid settings use bounded categories and `null` effective limits. For the closed schema, precedence and full-restart rule, see the [owner judge settings reference](judge.md).

This is local readiness, not connectivity, calibration or model attestation. Injected SDK dependencies use the [SDK identity contract](sdk.md#judge-readiness-and-identity), not standalone doctor.

Text output marks APUS experimental and reports provider execution as not requested, with label matching and calibration unverified. A successful later assessment is evidence of execution only. Comparing its label with a fixed expectation is a different check and does not establish calibration.

Invalid CLI arguments or an unexpected inspection failure exit `2` with bounded usage guidance. Diagnostics never echo raw exceptions, invalid environment values or policy contents.

Externally derived paths, digests and detected versions are bounded, strip terminal controls and redact the configured credential value. Compatibility classification uses the original metadata.

## Fix invalid or unavailable setup

| Symptom | Next action |
| --- | --- |
| `project-unavailable` | Select an existing readable project directory with `--project`. |
| Policy absent, state `dormant` | Author that project's `TENET.md` yourself outside the guarded action path, or select an owner-reviewed project file with `TENET_POLICY`. Review optional `~/.tenet/TENET.md` before authoring it externally: it activates projects without local rules, can reach the selected judge and recordings, and makes the whole set unavailable if invalid. Tenet never creates it automatically; registration supplies no policy. |
| Policy invalid | Check the reported source role. Both sources share 64 KiB and 16 declarations, with 4096 UTF-8 bytes per rule. Check UTF-8, case-sensitive `Rule;` lines and threshold syntax; repair externally, as doctor neither prints nor repairs policy text. |
| `configuration` | Check private owner settings and their bounded category, nonblank `TENET_POLICY`, exact mode values, threshold/limit ranges, approval timeout and the JSON sensitive-field array. Restart fully after correction. |
| `control-unavailable` | Check the absolute control path and private same-user file/directory. Fix unsafe links or permissions outside Pi. Doctor does not repair control. |
| `invalid-recording-setting` or `invalid-recording-directory` | Use exact `on`/`off` and an absolute recording directory, even when capture is off. |
| `delivery-incomplete` | For a checkout, build SDK/CLI and inspector and install locked dependencies. For an archive, replace the incomplete installation and install its locked production dependencies. |
| `untested-pi-version` | Use tested Pi 1.1.0 or a Tenet release tested with your host. Unknown metadata is a limitation, not a tested result. |
| `missing-credentials` | Configure the key securely before active launch. Doctor does not test validity or connectivity. |
| APUS ready but assessments unavailable | Check the owner-operated loopback backend and matching alias outside Pi. Doctor does not test connectivity, context capacity or native responses. Do not add a TypeSafe key as a fix. |
| Ready but no footer or `/tenet` command | Check the actual launch directory, policy selection, `pi list` and extension load errors. Fully restart Pi. Doctor cannot check registration or hook activation. |

For exact policy and setting details, see the [repository archive operation guide](https://github.com/koenvg/Tenet/blob/main/docs/ARCHIVE-OPERATION.md). In the archive, the [root installation guide](../README.md) links to the shipped operation reference.

## Policy, mode and control

Doctor uses the runtime's two-candidate selector. It first checks optional `~/.tenet/TENET.md` from the process owner's home. With `TENET_POLICY` unset, it also checks `TENET.md` in the directory selected by `--project`. A nonblank override replaces only the project candidate, resolving relative to that project, not the command's working directory.

Confirmed absence of both implicit candidates with no override is dormant when other prerequisites are valid and control is on. Any present invalid source, missing explicit file, broken link or filesystem uncertainty invalidates the complete set. Empty overrides are invalid configuration. Doctor has no parent search, bundled fallback, global-path override or opt-out.

Validation uses the runtime's UTF-8, line-based `Rule;` grammar and complete-set size/count limits. Output gives roles, candidate selection/presence, configured sources, resolved targets, per-file SHA-256 values, byte counts, per-source rule counts, combined identity and total declared rule count. It never prints rule text. The count excludes integrity. Invalid sets have no validated combined identity or count; `reason` and `failedRole` identify failure.

`TENET_MODE` defaults to observe. Only exact `observe` and `enforce` are valid for diagnosis. The runtime selects observe and warns on an invalid mode; doctor flags it for correction without changing runtime behavior.

Decision/evidence thresholds and limits, approval timeout, `TENET_SENSITIVE_FIELDS`, capture settings and control paths use existing configuration readers. Doctor reports invalid settings even if no policy is selected or control is off.

Control defaults to `~/.tenet/control.json` or an absolute `TENET_CONTROL_PATH`. A fresh missing control is on. Existing controls must pass the runtime's private same-user file and directory checks. Control is cooperative, not a same-user security boundary.

## What readiness cannot establish

### Hooks and provider remain unverified

Restart Pi and verify native `/tenet status` in an eligible session before relying on the guard. Doctor does not inspect extension registration or claim that tools are protected.

A real default assessment sends policy and evaluator evidence to TypeSafe and uses quota. An APUS assessment through forwarding sends them to the owner-selected Pika backend. Any live check needs separate authorization. Secret-bearing strings can survive redaction. Observe is non-blocking even on unavailable assessment; readiness is not a live safety guarantee.

### Host discovery does not prove the next launch

Pi 1.1.0 is the tested host. Doctor reads package metadata for the first executable `pi` launcher on PATH without executing it. Read-only permission checks skip non-executable candidates. Empty PATH components mean the current command directory, not the selected project.

Valid prerelease and build metadata are recognized, but only the exact tested pin is tested. With no launcher, doctor checks the selected project's then the installation's local Pi package metadata.

An unidentified launcher, missing metadata or malformed version stays unknown. A detected version outside the tested pin makes compatibility unavailable. Discovery is not proof of which host you will launch; unknown compatibility must not become a fabricated tested result.

### Delivery checks are not archive verification

Doctor checks compiled SDK/CLI/runtime entries, the Pi resource and inspector entry for the manifest's checkout or production layout, documentation, license, the corresponding lockfile and the matching installed TypeSafe runtime entry.

It does not execute imports, validate every transitive package or certify archive integrity. The packaging verifier separately checks the closed production delivery contract. Build an incomplete checkout, or replace an incomplete archive and install its locked dependencies.

### Capture health and coverage remain limited

Capture defaults to `~/.tenet/recordings`. `TENET_RECORDING=off` disables it; `TENET_RECORDING_DIR` must be absolute. Doctor checks configuration only, not directory health or future writes.

Local records can contain secrets. Disabling capture does not prevent later provider submission. Off and removal do not erase historical recordings.

Pi lacks exact result correlation, post-hook argument stability and stock authenticated action resolution. Pre-release hook checks do not sandbox commands or guarantee behavior after hook release. The Claude Code prototype is not supported by this setup path.
