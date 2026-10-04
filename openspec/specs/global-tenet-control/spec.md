# global-tenet-control Specification

## Purpose

Let a Pi owner switch TENET assessment and capture on or off across projects and concurrently running Pi processes without unloading the extension or mistaking observation for inactivity.

## Requirements

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

### Requirement: Persistent machine-wide choice
The on/off choice SHALL apply to TENET in every Pi project and every running Pi process belonging to this owner on this machine, and SHALL survive Pi restarts. A previously unconfigured installation SHALL begin ON, preserving the existing default observe mode and recording settings. An off command SHALL persist the choice and cancel pending work in its own process before reporting success; it SHALL NOT wait for acknowledgments from other processes. Running processes SHALL notice a change promptly without a Pi restart, including while idle, and SHALL read the latest shared choice before starting each assessment or releasing a pending call. A different process can still assess or release a pending call before it observes off; success of the command does not certify that every process has stopped. Repeated on or off commands SHALL be idempotent. On SHALL restore each process's previously configured observe or enforce mode without changing `TENET_MODE`, policy selection, or `TENET_RECORDING`.

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

### Requirement: Off skips the guard and new capture
While off, TENET SHALL not submit evaluations, open native approvals, create new invocation records, capture tool results for its trajectory, or veto newly encountered tool calls. The extension and activation commands SHALL remain loaded. It SHALL not erase previously recorded evidence; writes already queued before off can finish draining. No disabled invocation SHALL be reported as assessed, approved, recorded, or executed by TENET. Off is different from observe mode and from `TENET_RECORDING=off`.

#### Scenario: Unassessed tool call while off
- **WHEN** a tool call enters TENET after the process has observed off
- **THEN** TENET returns no veto or approval, makes no judge request, and creates no new invocation or evidence record

#### Scenario: Off invocation in a resumed transcript
- **WHEN** a Pi session is resumed after an off-state call and result appear in its native transcript
- **THEN** TENET omits that call and result from recovered evaluator trajectory, even if the shared choice is on at resume time

#### Scenario: No retroactive deletion
- **WHEN** a session already contains recordings and the owner turns off
- **THEN** the existing archive remains available, with no new invocations added while off

### Requirement: Safe in-flight transitions and unavailable control
On observing off, a running process SHALL cancel its pending assessments and approval prompts and prevent their later responses or approvals from authorizing the original invocation. An in-flight enforce-mode call whose permission was not yet released SHALL be vetoed on cancellation; an in-flight observe-mode call SHALL not receive a TENET veto. Calls already released or executing cannot be revoked. Before new permission is released, the process SHALL recheck the shared choice; changes between this check and host dispatch remain subject to the documented host boundary. If the control state exists but is malformed, unreadable, or otherwise cannot be trusted, TENET SHALL expose CONTROL UNAVAILABLE without claiming OFF or an all-clear, submit no new assessments or evidence, and use the base mode's conservative behavior: block in enforce, permit in observe. Missing state on a fresh installation SHALL not be treated as failure.

#### Scenario: Off during approval
- **WHEN** an enforce-mode approval prompt is pending as off is observed
- **THEN** that invocation does not execute based on a later approval, and new calls entering afterward bypass TENET

#### Scenario: Off during observe-mode assessment
- **WHEN** off is observed while an observe-mode request is pending
- **THEN** the request is cancelled, its late response cannot be used, and TENET does not veto the invocation

#### Scenario: Corrupt shared state
- **WHEN** a previously configured control file cannot be parsed in an enforce-mode process
- **THEN** status reports CONTROL UNAVAILABLE, no request or evidence is submitted, and new invocations are blocked rather than silently treated as off or on

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
