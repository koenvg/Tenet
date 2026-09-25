# Background observation

## Purpose

Keep observation useful without making developers wait for a network assessment, while preserving the difference between permission, assessment and actual execution.

## ADDED Requirements

### Requirement: Non-blocking observation from a fixed snapshot
In eligible on-state observe sessions, TENET SHALL capture a bounded immutable pre-execution snapshot and release permission without awaiting evaluator submission or completion. The snapshot SHALL fix the action, policy, thresholds, assessment profile, evidence and host/session/context generation before execution. Later tool results or external state SHALL NOT alter that invocation's assessment evidence. Observe mode SHALL never prompt for approval, mutate tool inputs or outputs, or deliver findings to the agent automatically. Enforce mode SHALL retain synchronous pre-release assessment and existing approval, freshness and cancellation checks.

#### Scenario: Evaluator does not respond
- **WHEN** an observe-mode judge remains unresolved
- **THEN** the call returns control to its host without waiting for the judge and the owner sees assessment pending rather than all-rules-pass

#### Scenario: Execution completes first
- **WHEN** a tool result arrives before its observation assessment completes
- **THEN** execution is correlated independently and the eventual assessment uses only the original snapshot

#### Scenario: Enforcement still waits
- **WHEN** the same unresolved judge is used in enforce mode
- **THEN** TENET does not release the invocation before a valid permitting result and any required invocation-local approval

### Requirement: Bounded observation work and explicit coverage loss
TENET SHALL bound observation concurrency, waiting jobs, total retained snapshot bytes and queue age. Exhaustion SHALL release the tool call in observe mode, mark the assessment dropped with a reason, and increment owner-visible loss counters. It SHALL NOT block the developer, grow unbounded memory, retry indefinitely, or report a dropped job as evaluated. Queue wait and provider duration SHALL be separately observable. Recording opt-out SHALL disable persistence without disabling observation or owner reporting.

#### Scenario: Burst exceeds capacity
- **WHEN** pending observation work reaches a configured bound
- **THEN** new excess assessments are dropped with visible coverage loss while tool calls remain permitted

#### Scenario: Expired queued snapshot
- **WHEN** a queued assessment exceeds its maximum age before submission
- **THEN** TENET records expiry rather than submitting it later against refreshed state

### Requirement: Lifecycle and off-state isolation
Queued and running assessments SHALL belong to the captured host/session/context generation. Off or unavailable control SHALL cancel queued and in-flight work and suppress late findings. Session/context invalidation SHALL prevent late completion from affecting another generation or session. Agent turn completion alone SHALL NOT cancel otherwise valid observation work; session termination SHALL cancel remaining work without an unbounded wait. Existing off-state capture suppression, dormant-session behavior and no-retroactive-deletion guarantees SHALL remain in force. Host cancellation and host restrictions SHALL not be bypassed.

#### Scenario: Owner switches off
- **WHEN** off is observed while jobs are waiting or running
- **THEN** TENET cancels them, submits no waiting jobs, publishes no late findings and does not revoke already released execution

#### Scenario: Session is switched or forked
- **WHEN** the original session/context generation ends before an assessment completes
- **THEN** its late response cannot appear as a finding for the new generation and cannot authorize any invocation

#### Scenario: Turn ends before the judge responds
- **WHEN** an agent turn ends but its session and observation generation remain active
- **THEN** a pending observation can finish against its original snapshot without reopening tool execution

### Requirement: Independent permission and assessment lifecycle records
A new versioned recording contract SHALL represent pending, completed, unavailable, dropped and cancelled assessment states independently of permission and execution. Permission SHALL be recorded once when released and SHALL NOT be rewritten when a later would-decision arrives. A pending or missing would-decision SHALL not be encoded as ALLOW or BLOCK. Result-before-assessment ordering SHALL remain readable. Missing results SHALL remain unknown. New readers SHALL preserve schema-1 and schema-2 meanings and identifiers without rewriting their files.

#### Scenario: Late would-block result
- **WHEN** an observe call is released, executes and subsequently receives BLOCK from the evaluator
- **THEN** its record shows released permission, independently observed execution and the later counterfactual BLOCK without a retroactive veto

#### Scenario: Crash with pending assessment
- **WHEN** a process exits before the assessment terminal record is persisted
- **THEN** inspection shows incomplete observation rather than inferring a pass or evaluator completion
