## Purpose

Preserve the evidence behind TENET assessments so owners can inspect actual evaluator inputs and decision outcomes across sessions and restarts.

## ADDED Requirements

### Requirement: Default-on complete assessment capture
TENET SHALL enable local recording by default for both observe and enforce modes, including passing assessments. Owners SHALL be able to disable recording without changing enforcement. For each submitted assessment, the archive SHALL retain the actual application-level questions, answer choices and state supplied to the evaluator, the policy snapshot and rule mapping, question version, requested model, effective thresholds, evidence limits and correlation identities. Captured state SHALL reflect the redaction and evidence bounding applied before submission, not reconstructed history or current files. Requests not submitted SHALL be explicitly distinguished from submitted requests.

#### Scenario: Passing assessment
- **WHEN** all rules pass and recording is enabled
- **THEN** the request and assessment are retained just as for a concern, despite the recent-concerns UI excluding that call

#### Scenario: Evidence bounding
- **WHEN** earlier observations are omitted or fields are redacted before submission
- **THEN** the archive retains the submitted evidence and its omission/redaction markers without recovering excluded content

#### Scenario: No request submitted
- **WHEN** missing credentials, invalid policy or capture failure prevents evaluator submission
- **THEN** the invocation records the available failure reason and no submitted request is fabricated

#### Scenario: Capture opt-out
- **WHEN** the owner disables recording
- **THEN** no new evidence archive payloads are written and assessment and enforcement behavior remain unchanged

### Requirement: Response and lifecycle provenance
Recordings SHALL correlate requests, provider responses, validation results, deterministic decisions, approval outcomes, permissions and observed execution using session ID and unique invocation identity, retaining call ID and tool name. They SHALL retain full validated per-rule distributions and returned model identifiers, and distinguish provider errors, invalid responses and interrupted attempts. Bounded invalid response content SHALL be inspectable as untrusted data with explicit truncation or unavailability markers. Missing execution evidence SHALL NOT be presented as successful execution. Provider-internal prompts or model rationale SHALL NOT be inferred.

#### Scenario: Invalid provider response
- **WHEN** an evaluator response fails validation
- **THEN** its bounded application response and validation failure are linked to the request and are not presented as a validated assessment

#### Scenario: Observe-mode violation
- **WHEN** TENET releases a call in observe mode whose assessment would block
- **THEN** the recording separately identifies would-block, released permission and any subsequently observed execution outcome

#### Scenario: Interrupted invocation
- **WHEN** a process stops after a request is recorded but before a response or tool result is recorded
- **THEN** historical inspection labels the missing stages as incomplete or unknown rather than inventing an outcome

### Requirement: Persistent cross-project session archive
The archive SHALL persist independently of the inspector and Pi process, group recordings by original session ID, retain project working-directory metadata, and make retained records available across restarts. Concurrent sessions and writers SHALL NOT overwrite one another; resumed sessions SHALL retain prior invocations, and forked sessions SHALL remain distinct. Arbitrary session IDs SHALL NOT become unchecked filesystem paths. Recording schema versions SHALL be explicit; unsupported, corrupt or incomplete records SHALL be reported without preventing access to valid records.

#### Scenario: Restart and resume
- **WHEN** Pi and the inspector restart and a session resumes
- **THEN** previous recordings remain available under that session ID and new invocations do not replace them

#### Scenario: Concurrent projects
- **WHEN** multiple Pi processes record sessions from different projects
- **THEN** one archive exposes their project metadata and session identities without mixing invocation records

#### Scenario: Corrupt record
- **WHEN** an archived record is incomplete, corrupt or uses an unsupported schema
- **THEN** the reader exposes a recording issue and continues to read valid records without silently declaring complete coverage

### Requirement: Local capture privacy and failure isolation
The archive SHALL be local with owner-restricted filesystem permissions and no telemetry. Capture SHALL exclude transport headers and API configuration credentials, SHALL NOT undo existing evidence redaction, and SHALL document that submitted strings can still contain secrets. Archive content SHALL NOT be automatically delivered to the agent or reused as evaluator history. Recording failures and bounded-queue exhaustion SHALL NOT change decisions, approvals or permissions; available owner channels SHALL report degraded capture. Storage location, default-on behavior, disabling and manual removal SHALL be documented. Retained sessions SHALL NOT be silently expired in this version.

#### Scenario: Disk unavailable
- **WHEN** recording fails because storage is unavailable
- **THEN** the original enforcement path proceeds unchanged and an available owner-only channel reports capture degradation

#### Scenario: Sensitive transport and evidence
- **WHEN** a request uses an API credential and includes field-redacted tool evidence
- **THEN** the archive excludes the transport credential and preserves the field-redacted evidence without claiming arbitrary strings are secret-free

#### Scenario: Owner-only reporting
- **WHEN** recording succeeds or fails
- **THEN** neither evidence payloads nor capture health reports are appended to agent-visible messages, tool results or evaluator trajectory
