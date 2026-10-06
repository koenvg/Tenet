# Spec delta

## MODIFIED Requirements

### Requirement: Session policy eligibility
At session start, TENET SHALL discover the optional global policy at `~/.tenet/TENET.md`, resolving `~` to the owner's home directory independently of the session working directory or host. It SHALL also select a project candidate from `TENET_POLICY` when explicitly set, resolving relative paths against the session working directory; otherwise it SHALL select `TENET.md` in that directory. An explicit override SHALL replace only the project candidate, never the global candidate. An empty override SHALL be invalid configuration, not an opt-out. Either present implicit candidate, an uncertain filesystem state, or an explicit project selection SHALL make the session eligible. Only confirmed absence of both implicit candidates without an override SHALL make it ineligible. TENET SHALL NOT search parent directories, use bundled policies, or infer eligibility from prompt attachments.

#### Scenario: No local policy or override
- **WHEN** both implicit candidates are confirmed absent and `TENET_POLICY` is unset
- **THEN** the session is ineligible in observe and enforce modes

#### Scenario: Local policy
- **WHEN** the global candidate is confirmed absent and a local `TENET.md` exists without an override
- **THEN** the session is eligible and TENET validates the local policy

#### Scenario: Global policy only
- **WHEN** the global policy exists and the local candidate is confirmed absent without an override
- **THEN** the session is eligible and TENET validates the global policy

#### Scenario: Global and local policies
- **WHEN** both implicit policy candidates exist without an override
- **THEN** TENET validates and applies both sources

#### Scenario: Explicit external policy
- **WHEN** `TENET_POLICY` names an absolute or relative path
- **THEN** the session is eligible and TENET validates that project source even if missing
- **AND** TENET also validates and applies the global source when present, without applying the replaced local candidate

#### Scenario: Explicit empty override
- **WHEN** `TENET_POLICY` is empty or whitespace-only, even with a valid global policy
- **THEN** configuration is unavailable rather than dormant or global-only

#### Scenario: Uncertain local file state
- **WHEN** a candidate has a broken link, unreadable parent, or other filesystem error that prevents confirmed absence
- **THEN** the session is eligible but assessment is unavailable if the candidate cannot be validated

#### Scenario: Prompt attachment alone
- **WHEN** both implicit candidates are absent, no override is set, and the owner attaches `@TENET.md`
- **THEN** that attachment does not activate TENET

### Requirement: Dormant guard has no session effects
In an ineligible session TENET SHALL bypass tool calls and results without assessment, veto, approval, new TENET records, trajectory capture, archive capture, TENET footer or startup notifications. It SHALL clear stale source, digest, readiness and footer state on every session transition.

A freshly loaded dormant extension SHALL register no TENET commands. Pinned Pi 0.85.1 MAY retain previously registered command names after an eligible-to-dormant session switch until a full native extension reload, but their handlers SHALL be silent while current eligibility is dormant or transitioning. The global on/off choice SHALL NOT make an ineligible session active. Earlier archived records SHALL remain intact.

#### Scenario: Dormant observe and enforce calls
- **WHEN** an ineligible session in either mode receives tool calls and results
- **THEN** TENET permits calls without assessments, prompts, new records, or active TENET status UI; previously registered command names may remain listed, but invoking them has no effects

#### Scenario: Global choice changes while dormant
- **WHEN** the shared on/off choice changes in another eligible session
- **THEN** the ineligible session remains dormant

#### Scenario: Policy appears after dormant startup
- **WHEN** a global or project policy is created after an ineligible session starts
- **THEN** it requires a new session or extension reload before becoming eligible

### Requirement: Broken active policies stay conservative
For eligible sessions TENET SHALL validate every selected source before assessment. A present invalid or unreadable implicit source, missing explicit project source, or invalid configuration SHALL make the entire assessment unavailable, not a partial policy pass. Enforce SHALL block new intercepted calls and observe SHALL permit without claiming an assessment. Policy changes, deletion, read failures, or changes in candidate presence after activation SHALL NOT make an eligible session dormant. New sessions or extension reloads SHALL reconsider eligibility and load the current source set.

#### Scenario: Present malformed local policy
- **WHEN** the project policy is malformed in enforce mode, even with a valid global policy
- **THEN** assessment is unavailable and intercepted calls block

#### Scenario: Present unreadable local policy in observe mode
- **WHEN** the project policy cannot be read in observe mode
- **THEN** calls are permitted without being reported as passing an assessment

#### Scenario: Invalid global policy
- **WHEN** the global policy exists but is malformed or unreadable, even with a valid project policy
- **THEN** the full policy set is unavailable and behavior follows the configured mode

#### Scenario: Explicit missing policy
- **WHEN** an explicit project source is missing, even with a valid global policy
- **THEN** TENET remains eligible but unavailable rather than falling back to global-only operation

#### Scenario: Policy disappears after activation
- **WHEN** either loaded source is deleted or becomes unreadable
- **THEN** the source set becomes stale or unavailable, not dormant, until reload

#### Scenario: Additional source appears in an active session
- **WHEN** a previously absent implicit candidate appears after activation
- **THEN** the current source set is stale and TENET does not silently continue under only the earlier rules
