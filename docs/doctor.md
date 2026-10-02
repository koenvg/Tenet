# Diagnose a project before starting Pi

Doctor inspects local setup offline. It does not start Pi or a guard session, contact TypeSafe, execute tools, open approval, watch files, create recordings or change policy, settings, control or credentials. It does not test writability by creating files.

## Direct invocation

From a checkout, install locked dependencies and build the compiled SDK/CLI and inspector once:

```sh
bun install --frozen-lockfile
bun run sdk:build
bun run inspector:build
```

Then use Node 22.12+ or Bun 1.3.14+, with no global Tenet binary installation:

```sh
node /absolute/path/to/tenet/dist/cli/index.js doctor --project /absolute/path/to/project
node /absolute/path/to/tenet/dist/cli/index.js doctor --project /absolute/path/to/project --json
bun /absolute/path/to/tenet/dist/cli/index.js doctor --project /absolute/path/to/project --json
```

The project defaults to the current directory. The installation checked is the directory containing the compiled CLI, not the project. The production archive includes this compiled CLI and reference. After its locked production dependency install, use the same direct invocation with no checkout builds. No global `tenet` binary is installed; see [the archive installation guide](../README.md) in the archive, or [the repository archive guide](https://github.com/koenvg/Tenet/blob/main/docs/INSTALL-ARCHIVE.md) in a checkout.

Doctor reads the same process environment that the next Pi process should inherit. It does not load dotenv files, read a secret manager or inspect Pi settings. Set `TYPESAFE_API_KEY` securely through your existing secret manager. Never put credentials in a policy or command-line arguments.

## Policy, mode and control

`TENET_POLICY` explicitly selects a policy, with relative paths resolved against the selected project. Otherwise doctor checks that project's `TENET.md`, not an ancestor or a bundled policy. A missing local policy is dormant; a missing explicit policy is invalid. Validation uses the runtime's UTF-8, line-based `Rule;` grammar and existing size/count limits. Output contains the selected source, a SHA-256 digest and declared rule count, never rule text. The count excludes the built-in policy-integrity constraint. Invalid policies have no validated digest/count.

`TENET_MODE` defaults to observe. Only observe and enforce are valid for diagnosis. The runtime still defaults an invalid mode to observe with a warning; doctor flags it for correction without changing runtime behavior. Decision/evidence thresholds and limits, approval timeout, `TENET_SENSITIVE_FIELDS`, recording settings and control paths use existing configuration readers. Doctor reports invalid configuration even when no policy is selected or control is off.

The cooperative control defaults to `~/.tenet/control.json`, or the absolute `TENET_CONTROL_PATH`. A fresh missing control is on. Existing controls must satisfy the runtime's same-user private-file and directory checks. Control is cooperative, not a same-user security boundary. Doctor never repairs it. Off takes precedence over dormancy when both apply.

## States and exits

| State | Meaning | Exit |
| --- | --- | --- |
| ready | Policy and active local prerequisites are valid | 0 |
| off | Owner-selected cooperative control is off | 0 |
| dormant | No local policy and no explicit override | 0 |
| invalid | Project, selected policy, configuration or control is invalid/unreadable | 1 |
| unavailable | Delivery is incomplete, detected Pi version is untested, or active setup lacks credentials | 1 |

Invalid prerequisites take precedence over unavailable delivery/compatibility and bypass states. Incomplete delivery or detected untested compatibility fails even when off or dormant. Missing credentials remain a separately visible limitation for off/dormant and do not make those coherent states fail. None of these states is an assessed permission. All reports say `assessment: not-requested`.

JSON uses `schemaVersion: 1` and includes `state`, `exitCode`, policy identity/validation, configuration, mode, control, credentials, capture, delivery, compatibility, issues and limitations. Invalid CLI arguments or an unexpected inspection failure exit 2 with bounded usage guidance. Diagnostics never echo raw exceptions, invalid environment values or policy contents. Externally derived paths, digests and detected versions are bounded, strip terminal controls and redact the configured credential value. Compatibility classification still uses the original metadata.

## What readiness cannot establish

Credential presence is not credential validity. Provider connectivity and hook activation remain unverified. Restart Pi and verify native `/tenet` status before relying on the guard. Doctor does not inspect extension registration or claim that tools are protected.

Pi 0.85.1 is the tested host. Doctor reads package metadata for the first executable `pi` launcher on PATH using read-only permission checks, without executing it. Non-executable candidates are skipped. Empty PATH components mean the current command directory, not the selected project. Valid prerelease and build metadata are recognized; only the exact tested pin is tested. If there is no launcher, it checks the selected project's then the installation's local Pi package metadata. This is discovery, not proof of which host you will launch. An unidentified launcher, missing metadata or malformed version stays unknown. A detected version outside the tested pin reports unavailable compatibility and pin/upgrade guidance. Unknown compatibility remains a limitation, not a fabricated tested result.

Delivery checks cover compiled SDK/CLI/runtime entries, the Pi resource and inspector entry for the manifest's declared checkout or production layout, documentation, license, the corresponding lockfile and the matching installed TypeSafe runtime entry. They do not execute imports, validate every transitive package or certify archive integrity. Build a checkout or replace an incomplete archive installation; install its locked dependencies. The packaging verifier separately checks the closed production delivery contract.

Capture defaults to a local archive under `~/.tenet/recordings`; `TENET_RECORDING=off` disables it and `TENET_RECORDING_DIR` must be absolute. Doctor checks configuration only, not directory health or future writes. Local assessment records can contain secrets. Disabling capture does not prevent policy and evaluator evidence from being submitted to TypeSafe when Pi later assesses actions.

Pi does not provide exact result correlation, post-hook argument stability or stock authenticated action resolution. Pre-release hook checks do not sandbox arbitrary commands or guarantee behavior after hook release. The Claude Code prototype is not supported by this setup path. Off and removal do not erase historical recordings.
