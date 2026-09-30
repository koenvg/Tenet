# Spec Delta

## Purpose

Lets coding-agent owners install Tenet for Pi and reach useful policy findings without a development checkout or SDK integration, with offline diagnosis and explicit coverage and privacy limits.

## ADDED Requirements

### Requirement: Production Pi delivery

TENET SHALL provide a versioned, relocatable local-install archive containing the declared Pi resource, compiled SDK and CLI with types, required runtime dependency metadata and matching lock, the built local inspector with its runtime entry, operation documentation, and licenses. Following the documented production-dependency installation recipe SHALL NOT require a source checkout, tests, a frontend build, or installing development tooling. The archive SHALL NOT include owner policies, credentials, recordings, test fixtures, developer dependency trees, or checkout-specific absolute import paths. SDK-only dependency installation SHALL NOT require the Pi host. This delivery SHALL remain a private CI artifact until publication is separately authorized.

#### Scenario: Install outside the checkout
- **WHEN** the owner extracts the archive at a new stable path and follows its documented dependency and Pi registration recipe
- **THEN** the pinned supported Pi loader discovers the extension and its runtime dependencies without access to the repository
- **AND** the built inspector can be served from that installation without rebuilding frontend assets

#### Scenario: SDK-only dependency installation
- **WHEN** an embedding application installs the delivery's runtime dependencies without Pi or development dependencies
- **THEN** the SDK entry and its type declarations resolve without installing an agent host or inspector development tooling

#### Scenario: Production content inspection
- **WHEN** CI produces the install artifact
- **THEN** its declared entries exist and it contains none of the excluded private or development data
- **AND** producing the artifact does not publish a package or modify owner settings

### Requirement: Coding-agent-first setup path

Owner documentation SHALL provide a short, tested Pi setup path separating one-time installation from per-project use: configure credentials securely, author explicit `Rule;` declarations in a local policy, diagnose setup offline, restart Pi, and inspect owner status and findings. Ordinary owners SHALL NOT need SDK code, tool registration, evidence schemas, approval callbacks, or a manually started bridge. Documentation SHALL explain that Pi loads local packages in place, so the extracted directory must remain available and production dependencies must be installed. Instructions SHALL preserve current policy selection and activation semantics rather than silently installing an active bundled policy or rewriting an owner's policy.

#### Scenario: Owner starts a policy-enabled project
- **WHEN** an owner follows the quickstart with a valid local `TENET.md`, configured credentials, no existing off choice, and no explicit mode override
- **THEN** the eligible Pi session starts in observe mode and exposes owner status and findings through existing native controls
- **AND** no adapter programming or tool allowlist is needed

#### Scenario: Policy-free project
- **WHEN** the globally installed extension is loaded in a project with no local policy and no explicit policy override
- **THEN** the quickstart explains dormancy and the absence of TENET session commands
- **AND** it directs setup diagnosis to the standalone offline command rather than claiming global installation supplied a policy

#### Scenario: Owner-written policy
- **WHEN** the quickstart introduces a policy example
- **THEN** it shows the explicit line-based declaration syntax and instructs the owner to author it outside the guarded agent's intercepted action path
- **AND** it does not require a change to the existing policy grammar

### Requirement: Read-only offline setup diagnosis

TENET SHALL offer `tenet doctor` for a selected project directory before Pi starts, with human-readable and structured output. It SHALL reuse current readiness semantics to report policy source and validation, mode and configuration errors, cooperative control state, credential presence, capture configuration, delivery completeness, and tested host compatibility. It SHALL NOT contact a provider, launch the agent, execute a tool, open an approval, create files or recordings, start watchers, or mutate policy, credentials, control or agent settings. Output SHALL use bounded safe diagnostics and SHALL NOT expose credential values, policy text or action payloads.

#### Scenario: Ready local setup
- **WHEN** doctor checks a valid policy-enabled project with configured credentials and complete delivery files
- **THEN** it reports local readiness, the configured mode, policy identity and count, and capture configuration without submitting any evidence
- **AND** it exits successfully while marking provider connectivity and hook activation unverified

#### Scenario: Invalid local setup
- **WHEN** the selected explicit policy is missing or malformed, local configuration is invalid, or required delivery files are absent
- **THEN** doctor reports a bounded cause and corrective guidance with a nonzero exit
- **AND** it does not repair the configuration or treat unavailable assessment as a pass

#### Scenario: Dormant or off setup
- **WHEN** a coherent setup is policy-free or has an owner-selected off state
- **THEN** doctor identifies dormant or off distinctly, without interpreting either as assessed ALLOW
- **AND** it exits successfully for the coherent state while listing applicable readiness limitations separately

#### Scenario: No diagnostic side effects
- **WHEN** doctor runs with an API key configured and a temporary project and home directory
- **THEN** file state remains unchanged, no provider or executor is invoked, and neither text nor structured output contains the key or policy contents

### Requirement: Honest readiness and coverage

Setup diagnosis and guidance SHALL distinguish local readiness, installed host compatibility, actual hook activation, and provider verification. Unknown installed versions or hook state SHALL remain unknown; detected unsupported host versions SHALL be reported as unavailable compatibility, not supported enforcement. Pi documentation and owner status SHALL retain declared limitations for result correlation, argument mutation after hook release, unsupported authenticated action resolution, and lack of OS isolation. The Claude Code prototype SHALL NOT be presented as supported by this setup path.

#### Scenario: Package ready but host not running
- **WHEN** doctor finds valid local configuration but cannot observe a running Pi guard
- **THEN** it does not claim the hooks are active or actions are protected
- **AND** guidance requires verifying native owner status after restart

#### Scenario: Untested host
- **WHEN** a safely detected installed Pi version is outside the delivery's tested compatibility
- **THEN** doctor reports unavailable compatibility and a pin or upgrade action
- **AND** missing version metadata is reported as unknown rather than a fabricated version

#### Scenario: Hook-level enforcement limits
- **WHEN** the setup path describes Pi enforcement
- **THEN** it distinguishes pre-release checks from post-hook executor guarantees and does not claim arbitrary commands or unobserved actions are sandboxed

### Requirement: Observation and enforcement remain distinct

The setup path SHALL default to observation, explain asynchronous findings and pending or unavailable assessment, and preserve explicit process-level enforcement opt-in. It SHALL distinguish mode selection from the existing on/off control and capture opt-out. Observe SHALL neither veto calls nor request approval; enforce SHALL retain current conservative unavailability, rule aggregation and invocation-local approval behavior. Setup improvements SHALL NOT lower thresholds or change semantic assessment to make demonstrations pass.

#### Scenario: First observe session
- **WHEN** an eligible session starts without an enforce mode selection
- **THEN** TENET permits calls while assessing bounded snapshots in the background and reports findings only to the owner
- **AND** pending or unavailable work is not described as a passing assessment

#### Scenario: Explicit enforcement opt-in
- **WHEN** an owner follows the documented enforcement path
- **THEN** the instructions require a newly started process with the enforce mode selected and verification of owner status
- **AND** they explain that the on command only restores the process's existing mode

### Requirement: Disclosure and removal before real use

Before the first assessed example action, owner guidance SHALL disclose submission of policy and evidence to TypeSafe and default local capture of potentially secret-bearing strings. It SHALL show the before-launch recording opt-out and state that this does not prevent provider disclosure. It SHALL describe safe extension removal and explain that off or uninstall does not erase historical recordings or provide a same-user security boundary. Setup acceptance examples SHALL use offline scripted judges and harmless local effects; live provider calls SHALL require separate authorization.

#### Scenario: Owner chooses no local capture
- **WHEN** the owner follows the opt-out instructions before launching an eligible session
- **THEN** local assessment recording is disabled while observation and owner reporting remain available
- **AND** the guidance still warns that evaluator evidence is submitted to TypeSafe

#### Scenario: Uninstall after observation
- **WHEN** the owner follows the removal instructions and restarts Pi
- **THEN** the extension is no longer loaded from that installation
- **AND** guidance states that previous recordings remain until separately removed

#### Scenario: Offline acceptance demonstration
- **WHEN** the installation and policy-to-findings acceptance flow runs in CI
- **THEN** it uses a scripted judge and harmless test executor, sends no provider requests, and makes no claim about live semantic accuracy
