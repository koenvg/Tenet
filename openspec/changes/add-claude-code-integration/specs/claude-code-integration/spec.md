# Spec Delta

## Purpose

Integrate Claude Code CLI tool hooks with Tenet's shared runtime while preserving native host permissions and explicitly reporting the limits of hook-based enforcement.

## ADDED Requirements

### Requirement: Complete supported tool-event mapping

The Claude Code adapter SHALL register synchronous pre-execution interception for all exposed tool names without action allowlists and SHALL translate available session, context, call, cwd, tool input and result identity into the shared contract. Missing descriptions, schemas, observations or lifecycle guarantees SHALL be marked as limitations rather than fabricated. Supported subagent calls SHALL remain distinct from their parent. Unknown or malformed event input SHALL be rejected without executing any supplied action. The adapter SHALL NOT read arbitrary transcript paths supplied in hook input.

#### Scenario: Built-in and MCP calls
- **WHEN** a supported Claude Code session emits pre-tool events for built-in and MCP tools
- **THEN** both follow the same rule assessment path with their original arguments and available metadata

#### Scenario: Missing tool metadata
- **WHEN** a hook supplies arguments but no description or parameter schema
- **THEN** the evidence identifies the missing metadata rather than inventing a tool definition

#### Scenario: Subagent call
- **WHEN** a subagent emits a call with its own context identity
- **THEN** its pending state and results cannot be attributed to a sibling or parent call

### Requirement: Conservative native permission mapping

In enforce mode the adapter SHALL return a valid pre-tool denial for BLOCK, unavailable evaluation, or ASK without trusted approval. For ALLOW it SHALL return no permission override, preserving all Claude Code permission checks. The initial adapter SHALL declare trusted approval unavailable and SHALL NOT use native ask as TENET consent, emit unconditional allow, or modify tool input. Observe, dormant and off paths SHALL not veto. Observation findings SHALL not enter stdout, stderr or additional context consumed by the agent; owner reporting SHALL use the archive and status interfaces. Denial reasons SHALL be bounded and omit raw arguments, provider prose and secrets.

#### Scenario: Passing policy with host denial
- **WHEN** TENET returns ALLOW but Claude Code's permissions prohibit execution
- **THEN** TENET does not override the host denial or claim execution

#### Scenario: Approval-required action
- **WHEN** a Claude Code call produces ASK in enforce mode, interactively or headlessly
- **THEN** TENET denies it as approval unavailable and preserves the ASK would-decision

#### Scenario: Observation concern
- **WHEN** an observe-mode call receives FAIL or encounters a provider error
- **THEN** it receives no TENET veto or agent-visible finding and owner records distinguish the concern or unavailability

### Requirement: Bounded private bridge protocol

The adapter SHALL use a versioned private local bridge with owner-restricted access, bounded requests/responses, bounded session state and bounded deadlines. It SHALL reject unsafe endpoint paths, unsupported protocol versions and ambiguous identities. Hook stdout SHALL contain only the host protocol response. Handled bridge absence, disconnection, invalid responses, timeout or runtime failure in an eligible enforce session SHALL produce a valid denial before the configured host hook timeout; observe SHALL remain non-vetoing. Dormant/off bypass SHALL remain available without a running bridge when trusted local state establishes it. Loss of prior eligibility state SHALL NOT silently convert an active session to dormant. Bridge restart SHALL invalidate old pending work and require a fresh session generation.

#### Scenario: Bridge unavailable
- **WHEN** a running hook client cannot contact the bridge for an eligible enforce session
- **THEN** it returns a valid denial within its bounded deadline instead of relying on an ordinary process error to block

#### Scenario: Dormant without a bridge
- **WHEN** trusted local state establishes a new policy-free session as dormant and the bridge is stopped
- **THEN** the hook bypasses without assessment, recording or veto

#### Scenario: Lost state after restart
- **WHEN** the bridge restarts with an old invocation pending or eligibility cannot be established safely
- **THEN** no old permission is reused and unavailable state is reported instead of assuming dormancy or execution

#### Scenario: Oversized protocol input
- **WHEN** a hook client receives input exceeding the configured bound
- **THEN** it rejects the input without sending a partial action for assessment and applies mode-specific unavailable behavior

### Requirement: Verified support profile and setup limits

Documentation and status SHALL identify the verified Claude Code version, OS and hook configuration, required lifecycle events, installation/removal steps and bridge health. Setup SHALL be explicit and SHALL NOT silently edit user settings. Support SHALL NOT include unverified platforms or other hosts. Verification SHALL exercise the actual pinned host's denial, native-permission preservation, successful/failed result correlation, concurrent/subagent behavior, lifecycle behavior, argument-mutating hook composition, hook timeout and process failure. If actual-host verification is unavailable, the release SHALL label enforcement support unverified rather than treating protocol fixtures as proof. Documentation SHALL state that disabled, unstarted or forcibly terminated hooks can bypass TENET and that same-user tampering and execution outside exposed hooks are not prevented.

#### Scenario: Conflicting mutating hook
- **WHEN** the configured host can change assessed arguments after TENET's hook
- **THEN** that composition is reported as outside the verified enforcement profile, not as protected unchanged execution

#### Scenario: Hook killed by host
- **WHEN** Claude Code terminates the hook before a decision is emitted
- **THEN** verification records the host's actual behavior and support documentation does not claim that TENET guaranteed denial

#### Scenario: Only offline fixtures available
- **WHEN** the hook protocol tests pass but the supported Claude Code binary cannot be exercised
- **THEN** host verification remains explicitly incomplete and no complete enforcement claim is made
