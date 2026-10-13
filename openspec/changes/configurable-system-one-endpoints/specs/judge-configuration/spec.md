# Spec Delta

## MODIFIED Requirements

### Requirement: Owner-wide settings source
Tenet SHALL read owner settings from `~/.tenet/config.json` and project overrides only from the canonical project's `.tenet/config.json`. It SHALL NOT search parent directories or use generic project configuration files. Project settings SHALL override every supported JSON setting, with complete judge replacement and partial limits inheritance. Confirmed absence of both files SHALL preserve official Jev defaults and existing limits. Settings SHALL remain separate from on/off control.

#### Scenario: Project precedence and isolation
- **WHEN** the owner selects hosted Jev and one canonical project supplies a complete anonymous local judge, a deadline and every observation limit
- **THEN** that project uses its judge, destination, model, auth, deadline and queue limits before existing environment/SDK overrides
- **AND** another project without overrides inherits the owner settings

#### Scenario: Same settings across projects
- **WHEN** the owner starts guards in two projects with one valid owner settings file and no project overrides
- **THEN** both guards select the same configured implementation and limits
- **AND** generic project `config.json` files do not override that selection

#### Scenario: Exact project source
- **WHEN** a session or offline doctor supplies a canonical project directory while parent directories or a policy directory contain other settings files
- **THEN** Tenet reads project overrides only from that canonical directory's `.tenet/config.json`
- **AND** neither parent settings nor policy paths determine the project selection

#### Scenario: Unconfigured owner
- **WHEN** owner and project settings files are both confirmed absent
- **THEN** Tenet retains `https://api.typesafe.ai`, `jev-latest`, the `TYPESAFE_API_KEY` credential source, the 2500 ms assessment deadline and existing queue defaults through the System One implementation

#### Scenario: Project selection without owner settings
- **WHEN** the owner settings file is confirmed absent and a valid project file supplies overrides
- **THEN** project values override the official default selection and limits
- **AND** omitted values inherit built-in defaults without creating an owner file

#### Scenario: Separate activation control
- **WHEN** the owner turns Tenet off or on
- **THEN** the operation does not edit or reinterpret the judge settings file

### Requirement: Bounded private settings validation
Tenet SHALL require version 2 JSON with supported fields and types, bounded to 32 KiB per file. Owner settings SHALL require a complete judge; project settings SHALL allow omitted override objects. Both files and their settings directories SHALL be private, same-owner and free of unsafe links. Invalid sources or effective settings SHALL produce configuration failure without default selection or repair. Diagnostics SHALL NOT print settings contents.

#### Scenario: Invalid settings
- **WHEN** either source's JSON is malformed, has an unsupported version or field, or supplies a wrong field type
- **THEN** an eligible guard reports configuration unavailable without submitting to any provider
- **AND** enforce blocks while observe permits without claiming an assessment

#### Scenario: Unsafe settings path
- **WHEN** either file is a symbolic link, has multiple hard links, is not a regular file, or the file or settings directory is not private and same-owner
- **THEN** settings are unavailable and are neither read as trusted configuration nor repaired automatically

#### Scenario: Oversized or unreadable file
- **WHEN** either file exceeds 32768 bytes or cannot be safely read
- **THEN** Tenet rejects it with a bounded configuration diagnostic and does not expose its contents

#### Scenario: Descriptor identity and encoding safety
- **WHEN** either settings source has unsafe ancestors, changes identity during a no-follow descriptor read or contains invalid UTF-8
- **THEN** Tenet rejects that source without trusting its contents, retrying the read or repairing its path

#### Scenario: Closed version 2 schemas
- **WHEN** either root contains fields other than `version`, `judge`, `decision` and `observation`, a nested object has unknown fields, or either file declares version 1
- **THEN** configuration is unavailable without automatic migration or fallback
- **AND** null values are errors rather than deletion syntax

#### Scenario: Partial project limits
- **WHEN** valid project JSON supplies only `version: 2` and `observation.running: 1`
- **THEN** only that JSON limit changes and omitted fields inherit owner values or built-in defaults
- **AND** a project with only `version: 2` inherits the complete owner/default selection and limits

#### Scenario: Invalid project with valid owner
- **WHEN** project settings are unsafe, unreadable, oversized, malformed or unsupported while owner settings are valid
- **THEN** that project's effective configuration is unavailable without contacting the owner-selected provider
- **AND** another project's valid configuration remains independent

#### Scenario: Invalid owner with valid project
- **WHEN** owner settings are invalid and project settings supply a complete valid judge and limits
- **THEN** the invalid owner source still makes configuration unavailable
- **AND** project overrides and SDK injection do not excuse invalid settings

### Requirement: Explicit provider selection
Settings SHALL select `system-one` or `apus-llamacpp` by `judge.protocol`, with explicit `baseUrl` and `model`. System One SHALL require explicit anonymous loopback or environment-backed bearer auth. APUS SHALL retain its native loopback/model contract without auth fields. A supplied project judge SHALL replace the complete owner/default judge atomically; an omitted judge SHALL inherit it completely. Selection SHALL NOT authorize retry, fallback or ambient credential inheritance.

#### Scenario: Local provider without a TypeSafe key
- **WHEN** valid APUS settings are selected and no TypeSafe key exists
- **THEN** local configuration can be ready with connectivity still unverified
- **AND** missing TypeSafe credentials do not disable the APUS judge

#### Scenario: Local provider fails
- **WHEN** APUS is unreachable or returns an invalid response
- **THEN** Tenet reports the selected provider failure and makes no TypeSafe request

#### Scenario: Default provider without credentials
- **WHEN** the official System One default is selected without its TypeSafe credential
- **THEN** eligible sessions retain the existing missing-credentials behavior

#### Scenario: Complete anonymous project replacement
- **WHEN** owner settings select hosted Jev with `TYPESAFE_API_KEY` and a project supplies a complete loopback System One judge with `auth.type: none`
- **THEN** the project uses only its protocol, destination, model and authentication choice
- **AND** it sends no authorization header and does not resolve the displaced owner's credential, even if that credential is missing

#### Scenario: Incomplete judge replacement
- **WHEN** a project supplies another endpoint but omits required protocol, model or System One auth fields
- **THEN** configuration fails rather than inheriting any owner judge field or credential source

#### Scenario: Explicit custom credential
- **WHEN** the effective System One judge selects an HTTPS origin and `auth: {"type":"bearer-env","name":"TENET_LOCAL_JUDGE_KEY"}`
- **THEN** only the named source in the frozen startup environment supplies its bearer credential
- **AND** Tenet does not implicitly reuse `TYPESAFE_API_KEY`

#### Scenario: Missing or unsafe selected credential
- **WHEN** the selected bearer environment value is absent, blank or contains whitespace, controls or non-ASCII header characters
- **THEN** the judge is locally unavailable with a bounded missing-credentials diagnostic and no request
- **AND** no diagnostic, recording or status exposes the credential value

#### Scenario: Explicit authentication syntax
- **WHEN** System One auth is neither exactly `{"type":"none"}` nor `{"type":"bearer-env","name":"ENV_NAME"}` with a name matching `[A-Za-z_][A-Za-z0-9_]{0,127}`, or APUS settings contain auth
- **THEN** configuration is unavailable without selecting another authentication mode
- **AND** anonymous authentication is accepted only for literal loopback, never a hosted origin

#### Scenario: Distinct APUS implementation
- **WHEN** a complete project APUS judge replaces an owner System One judge
- **THEN** APUS retains its native rendering, scoring, metadata and expected-model checks
- **AND** it neither inherits bearer credentials nor uses `/v1/systemone`

### Requirement: Configuration precedence
Project JSON SHALL override owner JSON for every supplied limit and SHALL replace a supplied judge completely. Omitted values SHALL inherit owner settings before built-in defaults. Explicit SDK judge dependencies, existing environment deadlines and explicit SDK observation limits SHALL remain above JSON. Both sources and effective settings SHALL be validated without changing policy, mode, thresholds, approval, evidence or recording controls.

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

#### Scenario: Every-field project overlay
- **WHEN** valid owner JSON supplies limits and project JSON supplies `decision.deadlineMs` and any of `observation.running`, `waiting`, `bytes` and `ageMs`
- **THEN** each supplied project field overrides the corresponding owner value and each omitted field inherits
- **AND** environment deadlines and explicit SDK observation limits override those merged values

#### Scenario: Effective range validation
- **WHEN** a supplied owner, project, environment or SDK value makes the effective deadline or observation limits invalid
- **THEN** configuration is unavailable rather than silently ignoring the value or relaxing queue bounds

### Requirement: Stable settings for a running guard
Each guard SHALL freeze owner settings and environment once, then cache an immutable valid or invalid effective snapshot at first initialization of each canonical project. Later sessions SHALL reuse that project's judge, credentials, deadline and queue limits. Projects SHALL remain isolated. File edits SHALL require a new guard or full Pi process restart, not reload or a new session. Activation control SHALL retain its existing live behavior.

#### Scenario: Edit during an assessment
- **WHEN** the owner changes either settings file while an initialized project has pending work
- **THEN** pending and later work in that project retains its original settings
- **AND** a newly constructed guard uses newly validated settings

#### Scenario: Owner and environment freeze before project initialization
- **WHEN** owner settings or environment change after guard construction but before a new canonical project's first session
- **THEN** that project merges its first project-file snapshot with the guard's frozen owner settings and environment
- **AND** it does not reread the changed owner file or environment

#### Scenario: Two projects in one guard
- **WHEN** a guard opens two canonical projects with different judges, credentials, deadlines and observation limits
- **THEN** each session, queue, status and record uses only its project's effective snapshot
- **AND** a failure in one project cannot replace another project's judge or credential closure

#### Scenario: Cached invalid project
- **WHEN** a project's first settings read is invalid and the file is later repaired
- **THEN** later sessions in that guard retain the unavailable snapshot without retry or owner fallback
- **AND** a new guard can read the newly valid source

#### Scenario: Session and guard disposal
- **WHEN** a session closes while another session or project has queued work
- **THEN** only the closing session's work is cancelled
- **AND** closing the guard disposes every project resource while shared owner control and archive ownership remain guard-wide

#### Scenario: Guard-owned injection
- **WHEN** one guard with an explicit SDK judge factory initializes several projects
- **THEN** it retains one guard-owned injected dependency rather than constructing that factory again for each project
- **AND** configured network judges are not constructed and invalid settings are still rejected

### Requirement: Provider-aware offline readiness
Doctor and owner readiness SHALL identify the effective project's implementation, model, validated origin, auth mode, source provenance and limits without contents or secrets. Guard status SHALL distinguish projects. Doctor SHALL inspect only local setup without provider/client construction, network requests, model/tunnel launches or settings writes. Readiness SHALL NOT imply connectivity, calibration, active hooks or accuracy. Historical displays SHALL use recorded fields only.

#### Scenario: Offline APUS diagnosis
- **WHEN** doctor inspects valid APUS settings without a TypeSafe key
- **THEN** it reports APUS's local configuration and experimental status without a missing-TypeSafe-key blocker
- **AND** connectivity and semantic accuracy remain unverified

#### Scenario: Dormant or off session
- **WHEN** a session has no eligible policy or activation is off
- **THEN** provider settings do not activate that session or submit an assessment
- **AND** existing dormant and off behavior remains unchanged

#### Scenario: Offline project selection
- **WHEN** doctor inspects a canonical project whose complete judge overrides the owner judge
- **THEN** it reports that project's effective protocol, model, canonical origin, auth mode and limits without network access
- **AND** anonymous/APUS credentials are `not-required`; selected bearer credentials are `present` or `missing`, with validity and connectivity unverified
- **AND** a displaced missing owner credential does not disable a valid project judge

#### Scenario: Project-aware guard status
- **WHEN** an owner inspects guard status before any project initializes or after several projects initialize
- **THEN** `GuardStatus.projects` is respectively empty or lists each canonical directory's judge, configuration and observation health
- **AND** session readiness and Pi status report the current session's effective selection rather than an ambiguous guard-wide judge

#### Scenario: Effective source provenance
- **WHEN** JSON or an existing explicit override determines an effective setting
- **THEN** reports and records identify its source as `owner`, `project`, `default`, `environment` or `sdk` as applicable
- **AND** no file contents, credential value or bearer environment reference name enters reports or recordings

#### Scenario: Invalid selection diagnostics
- **WHEN** configuration rejects a supplied destination before a complete assessment
- **THEN** reports retain bounded configuration diagnostics with a null destination rather than the rejected raw URL
- **AND** no returned model is fabricated

#### Scenario: Historical selection after edits
- **WHEN** a recorded invocation is viewed after owner or project settings change
- **THEN** its recorded selection, configuration and provenance retain their original meanings
- **AND** missing historical fields remain not recorded rather than copied from current settings
