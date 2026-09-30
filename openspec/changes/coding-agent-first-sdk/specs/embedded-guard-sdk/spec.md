# Spec Delta

## Purpose

Provides a small typed embedding interface that owns Tenet's policy and invocation bookkeeping, is used by the Pi integration, and keeps host responsibilities and actual enforcement coverage explicit.

## ADDED Requirements

### Requirement: Host-independent SDK distribution

TENET SHALL expose a documented alpha SDK entry with compiled ESM JavaScript and TypeScript declarations usable by supported Node and Bun runtimes. SDK import SHALL NOT require Pi, inspector assets, frontend tooling, private source imports, or consumer-side TypeScript transpilation. Import SHALL NOT contact the judge, create files, start watchers, or register host hooks. The supported entry and alpha compatibility limits SHALL be documented; private runtime modules SHALL NOT become supported consumer contracts merely because they exist in the source tree.

#### Scenario: Plain Node consumer
- **WHEN** a separate application with only Tenet's production dependencies imports the documented SDK entry
- **THEN** import succeeds under the supported Node runtime without Pi installed and without TypeScript execution support
- **AND** no filesystem or network side effects occur

#### Scenario: TypeScript consumer
- **WHEN** a separate TypeScript application imports the documented entry and its value types
- **THEN** its compiler resolves declarations without depending on private source paths or host package types

#### Scenario: Supported Bun consumer
- **WHEN** the same separate application imports the delivered entry using the supported Bun runtime
- **THEN** it resolves the same documented contract without accessing a development checkout

### Requirement: Shared guard ownership through sessions

The SDK SHALL let an embedding create a guard, open policy-scoped host sessions, submit proposed tool invocations and observed results, supply bounded observed history, query owner status, signal turn completion or lifecycle invalidation, and close owned resources. It SHALL own policy readiness, bounded evidence capture, judge evaluation and validation, deterministic aggregation, approval binding, bounded observation scheduling, activation and recording coordination. Pi SHALL consume this documented interface for those mechanics rather than maintain a separate engine or parallel construction and teardown logic. Host event translation, executor dispatch, trusted UI and transcript parsing SHALL remain adapter responsibilities.

#### Scenario: Pi and synthetic embedding parity
- **WHEN** Pi and an isolated synthetic embedding supply equivalent policy, evidence, configuration and scripted assessments through the documented interface
- **THEN** their shared assessment, permission and diagnostic behavior is equivalent
- **AND** differences in host coverage remain explicit rather than being filled in by tool-name inference

#### Scenario: Session without policy
- **WHEN** an embedding opens a session with confirmed absence of a local policy and no override
- **THEN** that session is dormant under current activation semantics, makes no judge or approval request, and creates no evidence or owner TENET UI effects

#### Scenario: Missing initialized session
- **WHEN** an embedding attempts a proposed invocation without a valid initialized session
- **THEN** enforcement returns unavailable and withholds permission, while observation permits without claiming an assessment

### Requirement: Explicit adapter obligations and coverage

The SDK SHALL require the embedding to identify the host, session and invocation, forward cancellation and material lifecycle transitions, reread current invocation identity and arguments before permission release, and dispatch tools only according to actual permission. Adapter documentation and status SHALL distinguish interception, result correlation, lifecycle invalidation, argument stability, trusted approval and authenticated action resolution. Unsupported or absent capabilities SHALL remain unsupported. Tool names, descriptions, arguments, model output and historical transcript claims SHALL NOT authenticate facts or upgrade declared coverage.

#### Scenario: Unsupported action resolution
- **WHEN** a host provides tool metadata but no executing-tool-bound action resolver
- **THEN** the SDK reports unsupported resolution and preserves the current conservative assessment behavior
- **AND** it does not classify a familiar tool name as a trusted read-only operation

#### Scenario: Unknown execution result
- **WHEN** a host result cannot be unambiguously correlated to an authorized invocation
- **THEN** execution status remains unknown under current correlation rules rather than certifying that the approved action executed

#### Scenario: Host permits later mutation
- **WHEN** an adapter cannot guarantee argument stability after its pre-tool hook returns
- **THEN** status and documentation retain that limitation
- **AND** SDK checks before release are not presented as a transactional guarantee over later executor input

### Requirement: Actual permission is separate from assessment

SDK outputs and owner events SHALL distinguish actual permission, assessment status, counterfactual decision, bypass reasons, and observed execution. In observe mode permission SHALL return after bounded pre-execution capture without awaiting the judge; pending, dropped, cancelled or unavailable work SHALL NOT receive a fabricated passing assessment. Late findings SHALL NOT recall released calls or enter agent messages, tool results, or later evaluator evidence. In enforce mode a pending assessment or ASK label SHALL NOT by itself authorize dispatch. Off and dormant SHALL remain distinguishable from evaluated ALLOW. WARN SHALL remain advisory.

#### Scenario: Delayed observation
- **WHEN** a scripted judge is stalled during an observe invocation
- **THEN** actual permission is released while assessment remains pending
- **AND** a later would-block finding is owner-only and does not change the earlier permission

#### Scenario: Enforce assessment pending
- **WHEN** the judge has not completed an enforce invocation
- **THEN** the embedding has no authorization to execute that invocation

#### Scenario: Provider unavailable
- **WHEN** a provider response is missing, invalid or unavailable
- **THEN** the SDK retains the operational cause, blocks in enforce mode, and permits without an all-clear in observe mode
- **AND** it fabricates neither per-rule scores nor execution evidence

### Requirement: Invocation-local authorization

For enforce-mode release, the SDK SHALL retain current policy integrity, freshness, confidence and aggregation gates and SHALL bind any required approval to the current host/session context, invocation, policy and original arguments. It SHALL recheck those bindings immediately before release, including after confirmation. Denial, dismissal, absent trusted UI, cancellation, timeout, stale policy or visible argument/identity changes SHALL withhold permission. An approval SHALL NOT authorize another invocation, retry or session. Model-selected ASK, chat statements and previous approvals SHALL NOT establish consent.

#### Scenario: Arguments change during approval
- **WHEN** a trusted UI approves but the host's current-invocation callback now returns different arguments
- **THEN** the original pending invocation is not released
- **AND** the changed action requires a new invocation and assessment

#### Scenario: Retry after approval
- **WHEN** a later call repeats the same tool arguments after an earlier invocation was approved
- **THEN** the earlier approval cannot satisfy the new call's approval requirement

#### Scenario: No trusted approval channel
- **WHEN** a BLOCK rule requires approval in enforce mode but the embedding lacks a trusted approval channel
- **THEN** the invocation is blocked rather than being released on the ASK label or a claimed prior consent

#### Scenario: Policy changes before release
- **WHEN** the selected policy changes while assessment or confirmation is pending
- **THEN** current stale-policy and lifecycle behavior prevents release under the old authorization

### Requirement: Lifecycle and resource ownership

The SDK SHALL invalidate pending authorization and applicable background work on session/context replacement, cancellation, off, detected policy staleness or disposal, suppressing late owner findings as required by the current runtime contract. Turn completion SHALL finish unmatched execution tracking without cancelling still-valid observation assessments. Closing a session or guard SHALL release its watches, session state and owned resources, prevent new work on closed handles, and use bounded archive drain rather than waiting indefinitely. Repeated close SHALL be safe, and closing one session SHALL NOT invalidate an unrelated session.

#### Scenario: Context switch with late approval
- **WHEN** an embedding invalidates a context while its native confirmation is open
- **THEN** a late positive answer cannot release that context's pending invocation

#### Scenario: Turn ends before observation completes
- **WHEN** a turn ends after observe permission release but before its assessment finishes
- **THEN** valid background assessment can finish and report to the owner
- **AND** absent tool results remain unknown rather than being inferred as successful

#### Scenario: Off during pending work
- **WHEN** the shared owner control switches off while assessment or approval is pending
- **THEN** pending enforce authorization cannot be released by a late response, observe calls are not retroactively vetoed, and new calls follow existing off capture and assessment behavior

#### Scenario: Independent session closure
- **WHEN** one of two sessions is closed, then close is called again
- **THEN** its pending work is invalidated and its resources are released without error
- **AND** the other session continues under its own policy and generation

### Requirement: Preserve evidence and historical interpretation

SDK extraction SHALL preserve the current assessment contract, question version, thresholds, built-in integrity handling, capture defaults, bounded redaction rules and recorded-contract interpretation. SDK owner events SHALL preserve distinctions between violations, uncertainty, approval conditions, unavailable evaluation and pending observation, without provider-invented rationale. Consumers SHALL be told that capture may contain source or secrets and that recording opt-out does not prevent evaluator disclosure. Offline injected judges SHALL remain available without a production credential, and scripted tests SHALL NOT be described as semantic accuracy evidence.

#### Scenario: Extraction with identical validated assessment
- **WHEN** the same policy, evidence, validated assessments and configuration are supplied before and after SDK extraction
- **THEN** deterministic aggregation, scores, thresholds, diagnostics and invocation-local approval behavior remain unchanged

#### Scenario: Historical recording after installation upgrade
- **WHEN** the delivered inspector opens records written before SDK extraction
- **THEN** it interprets their recorded contract and values without reevaluating them under the current policy

#### Scenario: Hermetic SDK test
- **WHEN** an embedding uses an injected scripted judge, isolated control and recording configuration, and no API key
- **THEN** contract behavior is testable without a provider request or changes to the owner's home directory
