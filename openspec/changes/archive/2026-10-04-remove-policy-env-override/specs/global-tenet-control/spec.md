# Spec Delta

## MODIFIED Requirements

### Requirement: Owner-facing activation commands
When the TENET Pi extension is loaded in an eligible session, it SHALL offer `/tenet status`, `/tenet on`, and `/tenet off`; bare `/tenet` SHALL retain its findings view. An ineligible session SHALL offer no TENET commands or status UI. In an eligible session status SHALL identify the effective state as ON OBSERVE, ON ENFORCE, OFF, or CONTROL UNAVAILABLE, show the configured base mode and relevant readiness, and distinguish OFF from observation and recording-only opt-out. Commands SHALL not inject status or archived evidence into agent messages or tool results. Invalid arguments or failed state writes SHALL report an error and SHALL NOT claim that activation changed.

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
- **WHEN** the owner starts Pi in a directory with confirmed absence of local `TENET.md`, regardless of `TENET_POLICY`
- **THEN** TENET offers no commands, footer, or notifications in that session, even if the shared choice is on or its control file is unavailable

### Requirement: Pi-wide setup guidance and limits
The owner documentation SHALL describe how to load the extension globally in Pi, activate it with a local `TENET.md` in each session working directory, verify status in eligible sessions before live calls, turn it off and back on, and remove the global loading configuration. It SHALL state that `TENET_POLICY` no longer selects a policy and that sessions without a local policy are dormant in both modes and show no TENET UI. It SHALL explain that projects using only the former override need an owner-reviewed local policy before restarting. A present unusable policy remains unavailable with mode-specific behavior; missing credentials in eligible sessions also follow existing unavailable behavior. It SHALL state that off does not remove past recordings and that same-user processes and agents can change this cooperative control state. It SHALL not describe this toggle as an operating-system security boundary or as support for other agent hosts.

#### Scenario: Pi in a project without TENET.md
- **WHEN** an owner loads TENET globally and starts Pi in a directory without local `TENET.md`
- **THEN** the instructions identify the dormant state, even in enforce mode, and do not claim global loading or `TENET_POLICY` supplies a policy automatically

#### Scenario: Local policy that cannot be loaded
- **WHEN** an owner globally loads TENET in a project with a present but unusable `TENET.md`
- **THEN** the instructions distinguish that policy-unavailable state from dormancy and explain its observe and enforce outcomes

#### Scenario: Explicit path that cannot be loaded
- **WHEN** an owner globally loads TENET without local `TENET.md` and the former `TENET_POLICY` override names an unavailable file
- **THEN** the instructions explain that the ignored override does not activate TENET and the session is dormant in both modes

#### Scenario: Migration from an external policy
- **WHEN** an owner previously used `TENET_POLICY` without a local project policy
- **THEN** the instructions require the owner to place a reviewed policy at the session directory's `TENET.md` outside the guarded agent path, restart the process, and verify native status before authorized live work
