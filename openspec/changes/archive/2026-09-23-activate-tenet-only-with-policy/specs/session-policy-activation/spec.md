## Purpose

Selects whether a loaded Pi extension guards a session based on its policy source, without treating an absent local policy as a broken active policy.

## ADDED Requirements

### Requirement: Session policy eligibility
At session start, TENET SHALL select an eligible policy source when `TENET_POLICY` is explicitly set, resolving relative paths against the session working directory; otherwise it SHALL use only `TENET.md` in that directory. An explicit but empty `TENET_POLICY` SHALL be an invalid configuration, not an opt-out. With no override, TENET SHALL treat only a confirmed absence of the local `TENET.md` as ineligible. It SHALL NOT fall back to a policy bundled with the extension, search parent directories, or infer eligibility from `@TENET.md` prompt attachments.

#### Scenario: No local policy or override
- **WHEN** a Pi session starts in a directory without `TENET.md` and `TENET_POLICY` is unset
- **THEN** the session is ineligible regardless of its observe or enforce mode

#### Scenario: Local policy
- **WHEN** a Pi session starts with a local `TENET.md` and no `TENET_POLICY` override
- **THEN** the session is eligible and TENET loads and validates that file

#### Scenario: Explicit external policy
- **WHEN** a Pi session starts without a local `TENET.md` and `TENET_POLICY` names an absolute or relative path
- **THEN** the session is eligible and TENET loads and validates the explicit source, even if the source does not exist

#### Scenario: Explicit empty override
- **WHEN** `TENET_POLICY` is explicitly set to an empty or whitespace-only value
- **THEN** TENET treats the configuration as unavailable rather than going dormant

#### Scenario: Uncertain local file state
- **WHEN** TENET cannot establish that the local `TENET.md` is absent because of a filesystem error or a broken link
- **THEN** TENET treats the session as eligible but policy-unavailable, not dormant

#### Scenario: Prompt attachment alone
- **WHEN** a session has no local or explicit policy source and the owner attaches `@TENET.md` to a prompt
- **THEN** that attachment does not activate TENET

### Requirement: Dormant guard has no session effects
In an ineligible session TENET SHALL bypass tool calls and results without assessment, veto, approval, new TENET records, trajectory capture, archive capture, TENET footer or startup notifications, or TENET commands in the session UI. The global on/off choice SHALL NOT make an ineligible session active. Earlier archived records SHALL remain intact.

#### Scenario: Dormant observe and enforce calls
- **WHEN** an ineligible session in either observe or enforce mode receives tool calls and results
- **THEN** TENET permits the calls without judge or approval requests, creates no new TENET evidence or session records, and shows no TENET UI

#### Scenario: Global choice changes while dormant
- **WHEN** the owner switches the shared choice to on or off in another eligible Pi session
- **THEN** the ineligible session remains dormant and does not start recording or intercepting calls

### Requirement: Broken active policies stay conservative
For eligible sessions TENET SHALL validate the selected source before normal operation. If the policy is unreadable, malformed, missing at an explicit path, or otherwise invalid, TENET SHALL report policy unavailability and retain the existing mode-specific behavior: enforce blocks new calls and observe permits without claiming an assessment. Once a session has been eligible, a policy change, deletion, or read failure SHALL NOT reclassify it as dormant during that session. Eligibility SHALL be reconsidered on a new session or extension reload, rather than on each tool call.

#### Scenario: Present malformed local policy
- **WHEN** a local `TENET.md` exists but fails validation in enforce mode
- **THEN** TENET reports policy unavailable and blocks intercepted calls

#### Scenario: Present unreadable local policy in observe mode
- **WHEN** a local `TENET.md` cannot be read in observe mode
- **THEN** TENET reports unavailable, permits calls without assessment, and does not present them as passing

#### Scenario: Explicit missing policy
- **WHEN** `TENET_POLICY` names a missing file in enforce mode
- **THEN** TENET reports policy unavailable and blocks intercepted calls rather than going dormant

#### Scenario: Policy disappears after activation
- **WHEN** an eligible session's policy is deleted or changed after activation
- **THEN** the session follows its existing stale-policy and mode-specific unavailable behavior, not dormant behavior
