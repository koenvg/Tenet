# Spec delta

## MODIFIED Requirements

### Requirement: Owner-facing activation commands
When the TENET Pi extension is loaded in an eligible session, including one with only a global policy, it SHALL offer `/tenet status`, `/tenet on`, and `/tenet off`; bare `/tenet` SHALL retain its findings view. An ineligible session SHALL offer no TENET commands or status UI. In an eligible session status SHALL identify the effective state as ON OBSERVE, ON ENFORCE, OFF, or CONTROL UNAVAILABLE, show the configured base mode and relevant readiness, and distinguish OFF from observation and recording-only opt-out. Commands SHALL not inject status or archived evidence into agent messages or tool results. Invalid arguments or failed state writes SHALL report an error and SHALL NOT claim that activation changed.

#### Scenario: Existing findings command
- **WHEN** the owner enters `/tenet` without an argument in an eligible session
- **THEN** the existing owner-only findings view opens rather than toggling activation

#### Scenario: Status in off state
- **WHEN** the shared choice is off and an eligible Pi process was started with `TENET_MODE=enforce`
- **THEN** `/tenet status` and the owner footer show OFF and identify enforce as the mode that on will restore

#### Scenario: Invalid command
- **WHEN** the owner enters `/tenet enable` or the shared state cannot be written in an eligible session
- **THEN** no activation change is reported as successful and the owner sees a safe error

#### Scenario: No policy eligibility
- **WHEN** both implicit policy candidates are confirmed absent and no explicit project override is set
- **THEN** TENET offers no commands, footer, or notifications even if shared control is on or unavailable

#### Scenario: Global-only eligibility
- **WHEN** a global policy exists and there is no project policy or override
- **THEN** the loaded Pi extension offers the same activation commands and readiness UI as other eligible sessions

### Requirement: Pi-wide setup guidance and limits
The owner documentation SHALL explain how to load TENET globally in Pi, author the optional `~/.tenet/TENET.md` outside the guarded action path, combine it with a local or explicitly selected project policy, verify source-aware status before live calls, turn assessment off and on, and remove global extension loading. It SHALL state that `TENET_POLICY` replaces only the project candidate, not the global policy. Only confirmed absence of both implicit candidates without an override SHALL imply dormancy. Present unusable sources, missing explicit sources, and missing credentials in eligible sessions SHALL retain existing mode-specific unavailable behavior. Guidance SHALL warn that global rules can activate projects without local policies and can be disclosed through evaluation and recording. It SHALL state that off preserves past recordings, that same-user processes and agents can change cooperative control state, and that cooperative controls and policy integrity are not an OS security boundary or proof of other-host coverage.

#### Scenario: Pi in a project without TENET.md
- **WHEN** TENET is loaded globally, the project has no local policy or override, and no global policy exists
- **THEN** the instructions identify dormancy and distinguish extension registration from supplying a policy

#### Scenario: Global policy activates multiple projects
- **WHEN** the owner authors the global file and starts eligible Pi sessions in different projects
- **THEN** the instructions explain that the personal rules apply in both projects alongside any selected project rules

#### Scenario: Explicit path that cannot be loaded
- **WHEN** `TENET_POLICY` points to a missing or unusable source while a valid global policy exists
- **THEN** instructions describe complete policy unavailability, not global-only fallback, and explain observe and enforce outcomes

#### Scenario: Owner updates global policy
- **WHEN** the owner changes the global file outside the intercepted path
- **THEN** guidance explains stale active sessions, the required reload or restart, and checking both source digests and total rule count before live calls
