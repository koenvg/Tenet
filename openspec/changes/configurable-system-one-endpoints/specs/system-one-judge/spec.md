# Spec Delta

## Purpose

Let owners select a System One-compatible evaluator by endpoint and model while preserving Tenet's validation, approval and historical record contracts. This is a proposed contract for the Mac/Pika path and hosted use, not a live compatibility or accuracy claim.

## ADDED Requirements

### Requirement: Explicit version 2 judge selection
Tenet SHALL accept one current versioned settings schema for owner configuration and project overrides with `version: 2`. `judge.protocol` SHALL be `system-one` or `apus-llamacpp`; both require `baseUrl` and `model`. System One also requires `auth`. Unknown fields, protocols, malformed values and version 1 files SHALL fail configuration without default selection or automatic migration.

#### Scenario: Anonymous local System One
- **WHEN** private version 2 settings select `system-one`, `http://127.0.0.1:18091`, `kev-latest` and `auth: {"type":"none"}`
- **THEN** Tenet selects the System One implementation without requiring TypeSafe credentials
- **AND** connectivity and accuracy remain unverified

#### Scenario: Old settings or invented provider
- **WHEN** settings use version 1, `judge.provider`, a `kev` protocol, extra fields or an empty/control-bearing model alias
- **THEN** configuration is unavailable and no provider is selected as a fallback

#### Scenario: APUS remains distinct
- **WHEN** version 2 settings select `apus-llamacpp` with its valid loopback URL and expected alias
- **THEN** Tenet retains the APUS native rendering, scoring, metadata and context checks
- **AND** APUS neither accepts `auth` nor uses `/v1/systemone`

### Requirement: Private settings and unchanged controls
Both settings files SHALL retain same-owner/private file and directory checks, no-follow reads, single-link and identity safety, valid UTF-8 and the 32768-byte bound per file. Tenet SHALL NOT repair files. JSON selection SHALL NOT change activation, policy, mode, thresholds, approval, evidence or capture controls. Existing environment deadline and explicit SDK overrides SHALL remain above JSON.

#### Scenario: Environment and SDK overrides
- **WHEN** owner JSON sets 120000 ms, project JSON sets 90000 ms and `TENET_JUDGE_DEADLINE_MS` sets 60000 ms
- **THEN** the whole assessment uses 60000 ms independently of the model
- **AND** explicit SDK judge injection and observation limits still take precedence over both files
- **AND** malformed effective settings remain configuration failures

### Requirement: Project overrides every JSON setting
Tenet SHALL read overrides only from `<project>/.tenet/config.json`, using the canonical session working directory or doctor project directory. Supplied project values SHALL override owner JSON for every supported setting. Project files require version 2 but SHALL allow omitted override objects. Tenet SHALL NOT search parents or read a generic project `config.json`.

#### Scenario: Complete project override
- **WHEN** owner settings select hosted Jev and a project supplies a complete anonymous local Kev judge, a different deadline and all observation limits
- **THEN** that project uses its judge, destination, model, auth, deadline and queue limits before existing environment/SDK overrides
- **AND** another project without overrides retains the owner selection

#### Scenario: Partial limits override
- **WHEN** project JSON supplies only `version: 2` and `observation.running: 1`
- **THEN** only that JSON limit changes and omitted fields inherit owner values or built-in defaults

#### Scenario: Exact source without parent search
- **WHEN** a parent directory or project root contains another configuration file
- **THEN** it does not affect the canonical project's `.tenet/config.json` selection

### Requirement: Atomic project judge replacement
A supplied project `judge` SHALL replace the owner/default judge completely and require every field of its selected implementation, including System One auth. It SHALL NOT inherit model, endpoint or credential source field by field. An omitted project judge SHALL inherit the complete owner/default judge. Null values and malformed partial judge objects SHALL be rejected.

#### Scenario: Anonymous project replaces hosted credentials
- **WHEN** the owner judge uses `TYPESAFE_API_KEY` and the project selects a complete loopback judge with `auth.type: none`
- **THEN** the project sends no authorization header and does not resolve the displaced credential source

#### Scenario: Changed destination without auth
- **WHEN** a project supplies another endpoint but omits required judge fields or auth
- **THEN** settings fail validation rather than inherit the owner's credential for that endpoint

### Requirement: Invalid sources never fall back
Tenet SHALL validate each present settings source and the merged effective configuration. Unsafe, unreadable, oversized, malformed or unsupported project settings SHALL make that project unavailable without owner/provider fallback. Invalid owner settings SHALL remain unavailable even with project overrides. Confirmed absence SHALL permit inheritance; confirmed absence of both files SHALL retain the official Jev default and existing limits.

#### Scenario: Invalid project with valid owner
- **WHEN** project settings are invalid while owner settings are valid
- **THEN** enforce blocks eligible calls and observe releases without claiming an assessment
- **AND** Tenet does not contact the owner-selected provider

#### Scenario: Neither settings file exists
- **WHEN** owner and project settings are both confirmed absent
- **THEN** the same System One implementation selects `https://api.typesafe.ai`, `jev-latest` and the existing `TYPESAFE_API_KEY` source
- **AND** the 2500 ms default deadline and existing queue defaults remain

### Requirement: Immutable isolated project snapshots
Tenet SHALL freeze owner settings and environment once per guard, then freeze effective settings at first initialization of each canonical project. Later sessions SHALL reuse that project's valid or invalid snapshot. One project's network selection SHALL NOT determine another project's credentials, judge, deadline or queue limits. File edits SHALL require a new guard or full Pi restart; injection SHALL NOT excuse invalid settings.

#### Scenario: Edit after first project initialization
- **WHEN** project settings change after its first session initializes
- **THEN** pending work and later sessions in that project keep the original selection
- **AND** a new guard reads new settings

#### Scenario: Two projects in one guard
- **WHEN** one guard opens projects with different endpoints, auth sources and observation limits
- **THEN** each session and its queued work use only its project's effective configuration
- **AND** another project's closure or configuration failure does not replace that selection

### Requirement: Effective project diagnostics and provenance
Session readiness, doctor and owner reports SHALL identify the effective project selection and settings provenance without contents or credential values. Guard status SHALL distinguish project selections rather than assert one judge for all projects. Recorded configuration SHALL retain source provenance and historical displays SHALL NOT recompute it from current files.

#### Scenario: Offline project doctor
- **WHEN** doctor inspects a project whose complete judge overrides the owner judge
- **THEN** it reports the project's effective origin, model, auth mode and source without network access
- **AND** the displaced owner's missing credential does not disable that valid project judge

#### Scenario: Historical project selection
- **WHEN** an old invocation is viewed after project settings change
- **THEN** its recorded selection and provenance remain unchanged and absent historical fields remain not recorded

### Requirement: Destination validation
System One base URLs SHALL be HTTPS origins, or exact HTTP literal `127.0.0.1`/`[::1]` origins with explicit ports 1 through 65535. APUS SHALL retain its current HTTP-loopback-only syntax. URLs SHALL NOT contain user information, query, fragment, backslashes, whitespace or non-root paths. Invalid raw syntax SHALL NOT become valid through URL normalization.

#### Scenario: Private Mac forwarding
- **WHEN** the owner configures `http://127.0.0.1:18091` for an owner-operated SSH forward to Pika
- **THEN** Tenet submits to Mac loopback only and does not create or manage forwarding
- **AND** documentation discloses that policy and selected evidence reach Pika

#### Scenario: Unsafe URL forms
- **WHEN** a base URL uses HTTP with a hostname or LAN address, an alternate loopback spelling, URL credentials, an empty `?`/`#`, `/v1`, or a dot-segment path
- **THEN** Tenet rejects settings before transport without printing the invalid URL

### Requirement: Explicit credential source
System One SHALL require `auth` to be either `{"type":"none"}` for literal loopback or `{"type":"bearer-env","name":"ENV_NAME"}`. Hosted use SHALL require the bearer form. Tenet SHALL resolve only the effective project's selected source from the frozen startup environment. Anonymous and APUS requests SHALL omit authorization. Secret values SHALL NOT enter either settings file, reports, recordings or logs.

#### Scenario: Custom hosted source
- **WHEN** settings select an HTTPS endpoint and `bearer-env` source `TENET_LOCAL_JUDGE_KEY`
- **THEN** only that source supplies the bearer header
- **AND** `TYPESAFE_API_KEY` is not used unless explicitly named by the effective configuration

#### Scenario: Missing or invalid credentials
- **WHEN** the selected environment variable is absent, blank or contains invalid header characters
- **THEN** the judge is unavailable with a safe missing-credentials diagnostic and submits no request
- **AND** diagnostics do not print the value

#### Scenario: Anonymous local evaluation
- **WHEN** loopback settings explicitly select `none` and TypeSafe credentials exist in the environment
- **THEN** no authorization header is sent and those credentials are not copied into capture or diagnostics

### Requirement: Fixed System One wire contract
Tenet SHALL POST JSON to the selected origin's `/v1/systemone` with explicit `model`, current prepared `state` and `questions`. It SHALL accept only the existing canonical model/choice-answer contract through common assembly and validation. There SHALL be no protocol detection, arbitrary response mapper or vendor-specific prompt/scoring branch.

#### Scenario: Compatible Jev and Kev fixtures
- **WHEN** scripted transports for official Jev and local Kev return the same valid answer set and returned alias
- **THEN** canonical assessments, gates and decisions match for identical prepared inputs and settings
- **AND** each request body uses its selected requested model rather than a hard-coded Jev alias

#### Scenario: Incompatible reply
- **WHEN** a response lacks required answers, has extra answer keys, unknown labels, invalid scores, a malformed returned model or an unsupported answer type
- **THEN** common validation rejects the complete assessment with no passing partial result

### Requirement: Bounded transport without recovery
System One requests SHALL reject redirects, omit ambient credentials and make no retries or fallback. Request JSON SHALL be at most 8 MiB and response bytes at most 1 MiB. Transport and body reading SHALL share the existing whole-assessment cancellation/deadline budget. Errors SHALL use safe categories, not arbitrary provider error bodies.

#### Scenario: Redirect or HTTP failure
- **WHEN** a selected endpoint returns a redirect, 401, 429 or 503
- **THEN** Tenet reports provider-error without following the redirect, recording its error body or issuing another request

#### Scenario: Stalled or oversized response
- **WHEN** transport/body reading stalls, cancellation occurs or the response exceeds its byte limit
- **THEN** Tenet ends acceptance within the common budget and reports timeout, cancelled or invalid-response as applicable
- **AND** a late response cannot grant permission

### Requirement: Strict probability compatibility
Tenet SHALL keep exact required labels, finite score ranges, highest-probability selection and unit-sum tolerance `0.000001`. It SHALL NOT normalize, round, fill missing probabilities or accommodate provider precision. Wire compatibility SHALL NOT imply calibration, accuracy or suitability for enforcement.

#### Scenario: Kev four-decimal rounding failure
- **WHEN** a five-label distribution is `0.9000`, `0.0250`, `0.0250`, `0.0250`, `0.0249`
- **THEN** its sum `0.9999` fails with invalid-response and the existing unit-sum diagnostic
- **AND** Tenet neither repairs the sum nor reduces thresholds

#### Scenario: Strictly valid local reply
- **WHEN** a scripted local distribution meets the current strict contract
- **THEN** it proceeds through the same validation and gates as hosted input
- **AND** offline success is not described as live Kev accuracy

### Requirement: Shared enforcement and lifecycle safety
Selected protocol and model SHALL NOT change authenticated-fact requirements, policy integrity, thresholds, evidence gates, cancellation, lifecycle invalidation or exact-call native approval. Observe SHALL continue to release without veto or approval; enforce SHALL fail conservatively when required assessment is unavailable.

#### Scenario: Unsupported exemption and stale approval
- **WHEN** local replies select NOT_APPLICABLE without matching current authenticated facts, or an approval belongs to another invocation
- **THEN** the current exemption or approval is rejected under existing gates

#### Scenario: Provider failure in either mode
- **WHEN** the selected provider fails
- **THEN** enforce blocks and observe releases without claiming a passing assessment or opening approval
- **AND** off/dormant sessions do not construct or contact a network judge

### Requirement: Recorded judge identity and destination
New judge reports SHALL use `judge-report-v2` and preserve requested implementation, model, validated destination origin, transport contract and authentication mode. Returned identity SHALL come only from a complete validated assessment. Assessment/question/native contract versions SHALL retain their meanings. Credentials and arbitrary error bodies SHALL NOT be captured.

#### Scenario: Requested alias differs from returned alias
- **WHEN** `kev-latest` is requested and a valid reply reports another nonempty model alias
- **THEN** both values remain distinct without treating the returned alias as weight attestation

#### Scenario: Failure before response
- **WHEN** missing credentials, timeout or invalid response prevents a complete assessment
- **THEN** the requested identity and destination remain available but no validated returned model is fabricated

### Requirement: Historical interpretation and owner diagnostics
Readers SHALL retain original historical identities and contracts without consulting current settings or rewriting records. SDK/Pi readiness and offline doctor SHALL disclose the selected destination and credential mode with connectivity unverified. Existing inspector/BB views SHALL use recorded fields; missing historical destinations SHALL remain not recorded.

#### Scenario: Historical TypeSafe and APUS archive
- **WHEN** old `judge-report-v1`, APUS-native or identity-absent records are opened after version 2 settings change
- **THEN** their original provider, requested/returned model and rendering/assessment identities remain unchanged
- **AND** no current destination or credential source is inserted

#### Scenario: Offline diagnosis
- **WHEN** doctor inspects anonymous local settings
- **THEN** it reports the selected protocol, model, origin, authentication mode and local availability without checking TypeSafe credentials or making HTTP requests
- **AND** hooks, connectivity, calibration and accuracy remain unverified

### Requirement: Separate authorization for operations
Documentation SHALL distinguish proposed configuration from live operations and disclose provider data, quota and logging limits. This change SHALL NOT install models, start services, manage SSH, change owner files, expose the unauthenticated inspector remotely, implement UI flow or authorize live evaluation/publication. Injected offline fixtures SHALL remain separate from live selection.

#### Scenario: UI development without a model
- **WHEN** an owner uses existing injected fixtures for UI checks
- **THEN** no live endpoint, implicit mock fallback or provider credential is required
- **AND** fixture results are not claimed as model accuracy or host coverage
