## Purpose

Apply TENET publication decisions before Pi executes observed tool invocations, using the host's existing execution and human-approval facilities. Keep approval scoped to an invocation and make observation coverage explicit.

## ADDED Requirements

### Requirement: Gate intercepted invocations before execution

When enabled, the Pi integration SHALL assess each exposed tool invocation before allowing its execution. It SHALL permit `ALLOW`, withhold `ASK` pending human approval, and reject `BLOCK`. Built-in, extension-provided, and subsequently registered tools SHALL use the same guard without per-tool or per-channel registration in TENET. The host SHALL remain responsible for execution, honoring the decision, and executing the assessed arguments without subsequent unreviewed changes. TENET SHALL NOT supply a protected execution environment.

#### Scenario: Blocked action has no tool execution
- **WHEN** TENET returns `BLOCK` for an intercepted invocation
- **THEN** Pi does not execute that invocation
- **AND** the agent receives the policy or failure reason

#### Scenario: Ordinary local work proceeds
- **WHEN** TENET returns `ALLOW` for an observed local operation
- **THEN** Pi executes the invocation without an approval prompt

### Requirement: Observe generic host tool events

The Pi integration SHALL obtain tool identity, available description and parameter schema, invocation arguments, and recent calls/results from existing host events and metadata. It SHALL preserve arbitrary input shapes and evidence provenance within the configured evidence budget. It SHALL NOT dispatch to shell, browser, or MCP-specific adapters, require field mappings, or execute extra tools to collect context. A missing description or result SHALL be reported as unavailable evidence rather than a missing TENET integration.

#### Scenario: Newly registered tool is assessed
- **WHEN** the host registers a new tool during a session and the agent invokes it
- **THEN** TENET captures its available metadata and arguments before execution
- **AND** it uses the existing decision path without a registry update or new adapter

#### Scenario: Prior result supplies context for a later call
- **WHEN** a tool result contains text describing an upload target
- **AND** a later call uses that target identifier
- **THEN** TENET supplies the earlier result and current arguments as ordered evidence
- **AND** it does not require a browser-specific parser or target mapping

#### Scenario: Tool evidence is sparse
- **WHEN** a tool exposes insufficient arguments or prior results to establish its effect
- **THEN** TENET returns an explicit insufficient-evidence decision
- **AND** it does not invent observations or start a separate context-collection workflow

### Requirement: Human approval applies only to the pending invocation

For `ASK`, the integration SHALL show the policy, tool identity, and sanitized proposed arguments in the host's approval UI. Destination or payload details SHALL be included only when present in the supplied evidence; tool-specific approval forms SHALL NOT be required. Only a positive response from that UI SHALL authorize the pending invocation. Approval SHALL bind to the session, tool-call identity, and assessed arguments. An approval MUST NOT authorize a later invocation, another tool, changed arguments, or an entire session. Agent-generated messages, page content, and task requests SHALL NOT substitute for this approval.

#### Scenario: User approves the pending publication
- **WHEN** the user positively confirms the pending publication in the host approval UI
- **AND** the assessed arguments remain unchanged
- **THEN** Pi may execute that invocation once
- **AND** TENET records the approval separately from the later tool outcome

#### Scenario: Agent switches route after denial
- **WHEN** the user denies a Git publication
- **AND** the agent subsequently proposes an equivalent publication through a browser or MCP tool
- **THEN** TENET assesses the new invocation independently
- **AND** any `ASK` decision requires a new positive UI response before execution

#### Scenario: Arguments change during approval
- **WHEN** the pending invocation's arguments change before TENET releases it
- **THEN** the prior assessment and approval do not authorize the changed invocation
- **AND** execution remains blocked until the changed action is assessed and approved as needed

#### Scenario: Task request asks for publication
- **WHEN** a user asks the coding agent to publish its work as part of the task
- **THEN** that task request does not bypass the immediate pre-execution approval required by the active policy

### Requirement: Approval cancellation and concurrency are safe

Denial, dismissal, cancellation, timeout, or an unavailable approval UI SHALL block the pending invocation. Concurrent `ASK` invocations SHALL receive separate approval decisions with unambiguous action identities. Approval state MUST NOT leak across session replacement, reload, branching, retries, or uncertain tool outcomes.

#### Scenario: No UI is available
- **WHEN** TENET returns `ASK` in a mode without an approval UI
- **THEN** the integration blocks the action with an approval-unavailable reason
- **AND** it does not fall back to automatic approval

#### Scenario: Two publications are pending
- **WHEN** two intercepted invocations each require approval
- **THEN** a positive response for one invocation does not authorize the other
- **AND** the UI presents each action independently

#### Scenario: Publication result is uncertain
- **WHEN** an approved invocation returns an error or indeterminate result
- **AND** the agent proposes a retry
- **THEN** TENET requires a new assessment and any necessary approval
- **AND** it does not infer that the first publication had no remote effect

### Requirement: Preserve bounded trajectory and distinguish outcomes

The integration SHALL retain a bounded sequence of proposed actions, semantic assessments, approval outcomes, and observed tool results for the active session. It SHALL distinguish `allowed`, `blocked`, `approved`, `executed`, `failed`, and `unknown outcome` rather than treating permission as proof of execution. Approval grants SHALL be discarded on session replacement or reload; no historical transcript entry SHALL recreate an executable grant.

#### Scenario: Denied attempt provides context for the next route
- **WHEN** the agent switches tools after a blocked publication
- **THEN** the next assessment can receive the earlier attempt and block result as trajectory evidence
- **AND** the earlier block does not predetermine the meaning of an unrelated local action

#### Scenario: Session is resumed
- **WHEN** a session with historical approvals is resumed or reloaded
- **THEN** TENET can retain bounded historical observations
- **AND** no historical approval permits a new invocation

### Requirement: Disclose the observation contract

The integration SHALL display its enabled status, supported policy, and known evidence limitations. Its compatibility contract SHALL be expressed in terms of host-exposed tool calls and available observations, not a fixed list of supported channels. Documentation and evaluation reports SHALL state that actions not exposed before execution, including subprocess actions and tool-internal background activity, are outside the observation contract. TENET MUST NOT claim universal publication prevention or provide sandboxing as part of this capability.

#### Scenario: Shell script publishes internally
- **WHEN** the host exposes only a script invocation and not an internal publication action
- **THEN** TENET's records identify the actual observed invocation and its evidence limitations
- **AND** any later-discovered internal publication is not falsely recorded as a separately intercepted action

#### Scenario: No browser or MCP tools are installed
- **WHEN** the Pi session has only its existing coding tools
- **THEN** the same generic guard operates on all exposed calls
- **AND** it does not require browser or MCP setup to become usable
