# Spec Delta

## Purpose

Let an owner select Tenet's evaluator for all projects on one machine, with explicit settings, safe failures, and no project-controlled provider changes.

## ADDED Requirements

### Requirement: Owner-wide settings source
Tenet SHALL read judge settings only from `~/.tenet/config.json` for the launching owner. It SHALL NOT search projects or parent directories for settings. A confirmed absent file SHALL preserve the existing TypeSafe default and existing limits. Settings SHALL remain separate from on/off control.

#### Scenario: Same settings across projects
- **WHEN** the owner starts guards in two projects with one valid owner settings file
- **THEN** both guards select the same configured provider
- **AND** a project-local `config.json` or `.tenet/config.json` does not override it

#### Scenario: Unconfigured owner
- **WHEN** the owner settings file is confirmed absent
- **THEN** Tenet retains TypeSafe, `jev-latest`, the 2500 ms assessment deadline, and existing queue defaults

#### Scenario: Separate activation control
- **WHEN** the owner turns Tenet off or on
- **THEN** the operation does not edit or reinterpret the judge settings file

### Requirement: Bounded private settings validation
Tenet SHALL require version 1 JSON with supported fields and types, bounded to 32 KiB. Existing files and their settings directory SHALL be private, same-owner, and free of unsafe links. Invalid, unreadable, oversized, or unsupported settings SHALL produce a configuration failure, not a default-provider selection. Diagnostics SHALL NOT print settings contents.

#### Scenario: Invalid settings
- **WHEN** JSON is malformed, has an unsupported version or field, or supplies a wrong field type
- **THEN** an eligible guard reports configuration unavailable without submitting to any provider
- **AND** enforce blocks while observe permits without claiming an assessment

#### Scenario: Unsafe settings path
- **WHEN** the file is a symbolic link, has multiple hard links, is not a regular file, or the file or settings directory is not private and same-owner
- **THEN** settings are unavailable and are neither read as trusted configuration nor repaired automatically

#### Scenario: Oversized or unreadable file
- **WHEN** the file exceeds 32768 bytes or cannot be safely read
- **THEN** Tenet rejects it with a bounded configuration diagnostic and does not expose its contents

### Requirement: Explicit provider selection
Settings SHALL support `typesafe` and `apus-llamacpp`. TypeSafe SHALL retain its fixed official destination and credential requirement. APUS SHALL require an explicit loopback base URL and expected model identity, without requiring or forwarding `TYPESAFE_API_KEY`. Selecting a provider SHALL NOT authorize fallback to another provider.

#### Scenario: Local provider without a TypeSafe key
- **WHEN** valid APUS settings are selected and no TypeSafe key exists
- **THEN** local configuration can be ready with connectivity still unverified
- **AND** missing TypeSafe credentials do not disable the APUS judge

#### Scenario: Local provider fails
- **WHEN** APUS is unreachable or returns an invalid response
- **THEN** Tenet reports the selected provider failure and makes no TypeSafe request

#### Scenario: Default provider without credentials
- **WHEN** TypeSafe is selected without its credential
- **THEN** eligible sessions retain the existing missing-credentials behavior

### Requirement: Private local destination
The APUS base URL SHALL use HTTP on the literal loopback address `127.0.0.1` or `[::1]`, with an explicit port and no user information, query, fragment, or non-root path. Tenet SHALL NOT follow redirects for local judge requests or forward TypeSafe credentials. A remote Pika process SHALL be reached through owner-operated private forwarding.

#### Scenario: Loopback forwarding
- **WHEN** APUS is selected at `http://127.0.0.1:8088` through an SSH tunnel
- **THEN** Tenet submits only to that local destination and does not launch or manage the tunnel

#### Scenario: Unapproved remote address or redirect
- **WHEN** settings contain a LAN/public hostname or a local request returns a redirect
- **THEN** Tenet rejects the destination or reports a provider failure without following the redirect

### Requirement: Configuration precedence
Explicit SDK judge dependencies SHALL override JSON provider selection. Existing environment deadline settings SHALL override JSON deadline settings, and explicit SDK observation limits SHALL override JSON queue limits. JSON SHALL supply omitted values before built-in defaults. Effective settings SHALL be validated without changing policy, mode, thresholds, approval, or recording controls.

#### Scenario: Environment deadline override
- **WHEN** JSON sets a 120000 ms deadline and `TENET_JUDGE_DEADLINE_MS` sets 60000
- **THEN** the complete assessment uses 60000 ms
- **AND** a malformed environment value is rejected rather than ignored

#### Scenario: Injected judge
- **WHEN** an SDK caller supplies a judge or judge factory while JSON selects APUS
- **THEN** the explicit dependency handles assessment and no configured network judge is constructed
- **AND** its requested model is reported as unknown unless the caller supplies an explicit identity

#### Scenario: Queue override
- **WHEN** JSON sets one running observation and the SDK caller explicitly sets two
- **THEN** the validated effective running limit is two

### Requirement: Whole-assessment and queue limits
JSON SHALL allow a whole-assessment deadline and the existing running, waiting, byte, and queue-age limits. JSON deadline and queue age SHALL be positive safe integers no greater than 2147483647 ms; queue counts and byte capacity SHALL be positive safe integers. Queue bounds SHALL remain enforced, with drops and expiry visible rather than reported as passes.

#### Scenario: Slow selected judge
- **WHEN** a complete assessment contains several APUS requests
- **THEN** they share one assessment deadline rather than receiving a new full deadline per question

#### Scenario: Capacity or age limit
- **WHEN** observations exceed configured capacity or wait longer than the configured queue age
- **THEN** Tenet reports dropped observations and does not invent an assessment or veto in observe mode

#### Scenario: Invalid limit
- **WHEN** a JSON-configured limit is zero, negative, fractional, nonfinite, or exceeds its permitted range
- **THEN** the effective configuration is unavailable

### Requirement: Stable settings for a running guard
Each guard SHALL keep one immutable settings snapshot for its lifetime. File edits SHALL NOT change a running guard's provider, deadline, or queue while work is pending. A new guard SHALL read a new snapshot; Pi's supported owner procedure SHALL require a full process restart after edits. Activation control SHALL retain its existing live behavior.

#### Scenario: Edit during an assessment
- **WHEN** the owner changes the provider file while an existing guard has pending work
- **THEN** the pending and later work in that guard retains its original settings
- **AND** a newly constructed guard uses the newly validated settings

### Requirement: Provider-aware offline readiness
Doctor and owner readiness SHALL identify the selected provider, model selection, settings source, and effective limits without exposing credentials. Doctor SHALL inspect local setup only, without a provider request, model launch, tunnel launch, or settings write. Local configuration readiness SHALL NOT imply connectivity, calibration, active hooks, or enforcement accuracy.

#### Scenario: Offline APUS diagnosis
- **WHEN** doctor inspects valid APUS settings without a TypeSafe key
- **THEN** it reports APUS's local configuration and experimental status without a missing-TypeSafe-key blocker
- **AND** connectivity and semantic accuracy remain unverified

#### Scenario: Dormant or off session
- **WHEN** a session has no eligible policy or activation is off
- **THEN** provider settings do not activate that session or submit an assessment
- **AND** existing dormant and off behavior remains unchanged
