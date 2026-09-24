# Spec Delta

## MODIFIED Requirements

### Requirement: Persistent machine-wide choice

The on/off choice SHALL apply to TENET in every Pi project and every running Pi process and local Claude Code bridge belonging to this owner on this machine, and SHALL survive their restarts. A previously unconfigured installation SHALL begin ON, preserving the existing default observe mode and recording settings. An off command SHALL persist the choice and cancel pending work in its own runtime before reporting success; it SHALL NOT wait for acknowledgments from other processes. Running runtimes SHALL notice a change promptly without a restart, including while idle, and SHALL read the latest shared choice before starting each assessment or releasing a pending call. A different process can still assess or release a pending call before it observes off; success of the command does not certify that every process has stopped. Repeated on or off commands SHALL be idempotent. On SHALL restore each session's previously configured observe or enforce mode without changing `TENET_MODE`, policy selection, or `TENET_RECORDING`.

#### Scenario: Two running projects
- **WHEN** `/tenet off` succeeds in one Pi process while another Pi process is running in a different project
- **THEN** the other process changes its status to OFF promptly without a restart, and its subsequent tool calls follow off behavior

#### Scenario: Command completes before another process observes off
- **WHEN** the issuing process has persisted off and cancelled its own pending work but another running process has not yet observed the change
- **THEN** `/tenet off` can report success without certifying that the other process's pending work has stopped

#### Scenario: Restart and re-enable
- **WHEN** Pi starts after a persisted off choice and the owner then runs `/tenet on`
- **THEN** the process starts OFF, and on restores the original process mode without changing its policy or capture opt-out configuration

#### Scenario: First use
- **WHEN** no shared choice has ever been configured
- **THEN** TENET remains on and retains existing observe/enforce and recording defaults

#### Scenario: Cross-host activation
- **WHEN** the owner switches off from Pi or the owner CLI while the local Claude bridge has pending assessments
- **THEN** the bridge promptly observes off, cancels pending work, prevents late enforce releases and skips new assessment and capture
- **AND** observation remains non-vetoing and calls already released cannot be recalled

### Requirement: Pi-wide setup guidance and limits

The owner documentation SHALL describe how to load the extension globally in Pi, activate it with a local `TENET.md` or explicit `TENET_POLICY` usable outside this repository, verify status in eligible sessions before live calls, turn it off and back on, and remove the global loading configuration. It SHALL state that sessions without either policy source are dormant in both modes and show no TENET UI; an explicit missing source or present unusable policy remains unavailable with mode-specific behavior; missing credentials in eligible sessions also follow existing unavailable behavior. It SHALL state that off does not remove past recordings and that same-user processes and agents can change this cooperative control state. It SHALL not describe this toggle as an operating-system security boundary. It SHALL identify local Claude Code bridges as additional consumers of the shared choice, with separate opt-in setup and verified coverage requirements; loading Pi alone SHALL NOT imply another host is integrated.

#### Scenario: Pi in a project without TENET.md
- **WHEN** an owner loads TENET globally and starts Pi in a directory with no local `TENET.md` and no explicit `TENET_POLICY`
- **THEN** the instructions identify the dormant state and do not claim global loading supplies a policy automatically

#### Scenario: Explicit path that cannot be loaded
- **WHEN** an owner globally loads TENET with `TENET_POLICY` pointing at an unavailable file
- **THEN** the instructions distinguish that policy-unavailable state from dormancy and explain its observe and enforce outcomes

#### Scenario: Pi-only installation
- **WHEN** only the Pi extension is installed
- **THEN** the instructions do not claim Claude Code interception merely because the shared control file exists

## ADDED Requirements

### Requirement: Owner CLI control and bridge status

TENET SHALL provide owner-invoked status, on and off CLI operations using the same cooperative control state as Pi. Status SHALL distinguish activation, configured mode, session eligibility, assessment readiness, capture state and bridge/adapter coverage when that information is available; absent runtime information SHALL remain unknown. CLI operations SHALL not inject findings into agent context or change policy, mode, hook settings or old recordings. Failed writes SHALL not report success. Corrupt/unreadable control SHALL prevent new assessment/capture and follow mode-specific unavailable behavior. The CLI SHALL remain usable without a running bridge and SHALL not claim remote cancellation acknowledgments it has not received.

#### Scenario: Bridge stopped
- **WHEN** the owner requests status or off without a running bridge
- **THEN** status identifies the bridge as unavailable, off can persist the choice, and neither operation claims all pending work has stopped

#### Scenario: Corrupt control in Claude session
- **WHEN** the shared control state cannot be trusted by an eligible Claude hook
- **THEN** it makes no new assessment or capture, denies in enforce, and permits without claiming a pass in observe
