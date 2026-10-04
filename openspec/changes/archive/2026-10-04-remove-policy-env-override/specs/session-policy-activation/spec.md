# Spec Delta

## MODIFIED Requirements

### Requirement: Session policy eligibility
At session start, TENET SHALL use only `TENET.md` in the session working directory for policy selection and eligibility across runtime-backed sessions, including Pi, Claude Code, and SDK sessions. `TENET_POLICY` SHALL have no effect, including when empty or whitespace-only. Only confirmed local absence SHALL make a new session ineligible. TENET SHALL NOT use a bundled fallback, search parent directories, or infer eligibility from `@TENET.md` prompt attachments.

#### Scenario: No local policy or override
- **WHEN** a new session starts without a local `TENET.md`, regardless of whether `TENET_POLICY` is unset or set
- **THEN** the session is ineligible in both observe and enforce modes

#### Scenario: Local policy
- **WHEN** a new session starts with a valid local `TENET.md`
- **THEN** the session is eligible and TENET loads and validates that file

#### Scenario: External policy cannot replace the local policy
- **WHEN** a valid local `TENET.md` exists and `TENET_POLICY` names a different valid absolute or relative policy path
- **THEN** TENET loads only the local policy and reports its source and digest

#### Scenario: Explicit external policy
- **WHEN** a new session has no local `TENET.md` and `TENET_POLICY` names an existing or missing absolute or relative path
- **THEN** the session remains ineligible and TENET does not load the named external policy

#### Scenario: Explicit empty override
- **WHEN** `TENET_POLICY` is empty or whitespace-only
- **THEN** the value does not invalidate configuration and TENET determines eligibility only from the local `TENET.md`

#### Scenario: Uncertain local file state
- **WHEN** TENET cannot establish that the local `TENET.md` is absent because of a filesystem error or a broken link
- **THEN** TENET treats the session as eligible but policy-unavailable, not dormant

#### Scenario: Prompt attachment alone
- **WHEN** a session has no local `TENET.md` and the owner attaches `@TENET.md` to a prompt
- **THEN** that attachment does not activate TENET

#### Scenario: Parent and installation policies are not selected
- **WHEN** the session working directory has no `TENET.md` but a parent or installation directory has one
- **THEN** the session remains ineligible and TENET does not select either other file

### Requirement: Broken active policies stay conservative
For eligible sessions TENET SHALL validate the local policy before normal operation. An unreadable, malformed, or otherwise invalid local policy SHALL remain unavailable: enforce blocks new calls and observe permits without claiming an assessment. `TENET_POLICY` SHALL NOT provide a replacement policy. Once eligible, a session SHALL NOT become dormant on policy change, deletion, or read failure. Eligibility SHALL be reconsidered on a new session or extension reload, not on each tool call.

#### Scenario: Present malformed local policy
- **WHEN** a local `TENET.md` exists but fails validation in enforce mode
- **THEN** TENET reports policy unavailable and blocks intercepted calls

#### Scenario: Present unreadable local policy in observe mode
- **WHEN** a local `TENET.md` cannot be read in observe mode
- **THEN** TENET reports unavailable, permits calls without assessment, and does not present them as passing

#### Scenario: External policy does not repair an invalid local policy
- **WHEN** a local `TENET.md` is unusable and `TENET_POLICY` names a valid external policy
- **THEN** TENET retains local policy unavailability and the configured mode's unavailable behavior

#### Scenario: Policy disappears after activation
- **WHEN** an eligible session's policy is deleted or changed after activation
- **THEN** the session follows its existing stale-policy and mode-specific unavailable behavior, not dormant behavior

#### Scenario: Explicit missing policy
- **WHEN** an enforce-mode session has a valid local `TENET.md` and the former `TENET_POLICY` override names a missing file
- **THEN** TENET loads the local policy and does not report policy unavailability because of the missing external path

## ADDED Requirements

### Requirement: Offline policy selection diagnostics
Doctor SHALL inspect only `TENET.md` in the directory selected by `--project` and report local selection and that file's source. `TENET_POLICY` SHALL NOT affect policy diagnostics or configuration validity. With other prerequisites valid and control on, confirmed local absence SHALL report dormant and an unusable local policy SHALL report invalid. Doctor SHALL remain offline and SHALL NOT print policy text or create recordings.

#### Scenario: Doctor uses the selected project
- **WHEN** doctor runs from another working directory with `--project` naming a project with a valid local `TENET.md` and `TENET_POLICY` naming another file
- **THEN** doctor reports local selection, the selected project's `TENET.md` source and digest, and its rule count

#### Scenario: Former override cannot hide local absence
- **WHEN** doctor checks a project with no local `TENET.md`, other prerequisites are valid, control is on, and `TENET_POLICY` names an existing or missing file
- **THEN** doctor reports dormant and absent local policy rather than explicit selection or an override-related error

#### Scenario: Former override cannot invalidate configuration
- **WHEN** doctor checks a project with a valid local policy and otherwise valid setup while `TENET_POLICY` is empty or whitespace-only
- **THEN** doctor reports valid configuration and local policy selection

#### Scenario: Invalid local policy is still reported
- **WHEN** doctor checks an unusable local `TENET.md` while `TENET_POLICY` names a valid external policy
- **THEN** doctor reports invalid local policy without loading or printing the external policy
