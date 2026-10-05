# Spec Delta

## Purpose

Use a self-hosted APUS model to assess complete Tenet requests while retaining independent rules, trusted-fact limits, validated scores, and honest experimental status.

## ADDED Requirements

### Requirement: Complete current assessment semantics
The local judge SHALL preserve the current bounded state, question instructions, criteria, and rule identities. It SHALL provide outcome, evidence sufficiency, and fact-reference answers where required, plus independent policy integrity. It SHALL NOT shorten instructions, omit material evidence, infer authenticated facts, or use a lone action classification as a complete assessment.

#### Scenario: One rule plus integrity
- **WHEN** a policy contains one user rule
- **THEN** the assessment includes that rule's outcome, evidence, and fact-reference answer, and integrity's outcome and evidence
- **AND** a single PASS answer cannot authorize the invocation

#### Scenario: Literal or incomplete evidence
- **WHEN** evidence contains literal executable-looking content or only partial authenticated coverage
- **THEN** the adapter preserves those facts and limits for evaluation and validation rather than treating text as execution or complete coverage

### Requirement: Native candidate probability scoring
For questions with multiple candidates, the local judge SHALL score the configured criteria through APUS's declared native choice contract. It SHALL return the selected candidate and a finite normalized distribution containing every expected candidate. Missing candidates, unsupported answer shapes, duplicate labels, invalid scores, and prompt truncation SHALL make the assessment invalid.

#### Scenario: Valid native scores
- **WHEN** the native response contains all expected candidate log probabilities
- **THEN** Tenet maps them to the original criteria, normalizes them, and applies its existing assessment validation
- **AND** normalization is not described as confidence calibration

#### Scenario: Missing candidate or wrong answer
- **WHEN** a candidate is absent, duplicated, nonfinite, or unmappable
- **THEN** Tenet reports an invalid response without filling missing probabilities or inventing a passing answer

#### Scenario: Prompt does not fit
- **WHEN** the complete native prompt exceeds configured context or the backend reports truncation
- **THEN** Tenet rejects the assessment rather than accepting a shortened interpretation

### Requirement: Single-candidate fact references
When the current authenticated state yields a fact-reference question whose sole candidate is `NONE`, Tenet SHALL return that sole allowed reference without model inference and mark its deterministic origin. It SHALL NOT fabricate another candidate, evidence assessment, or applicability exemption. Questions with multiple candidates SHALL use normal native scoring.

#### Scenario: Unsupported action resolution
- **WHEN** the only allowed fact-reference answer is `NONE`
- **THEN** the local adapter records a deterministic NONE answer without a native request for that question
- **AND** existing applicability validation still rejects unsupported NOT_APPLICABLE outcomes

#### Scenario: Authenticated reference is available
- **WHEN** the fact-reference criteria contain NONE and a current authenticated digest
- **THEN** the adapter scores both criteria and cannot create a different digest or operation identity

### Requirement: Shared decision gates
The local judge SHALL use Tenet's existing complete-assessment validation, thresholds, independent integrity, BLOCK/WARN handling, and invocation-local approval rules. Changing provider SHALL NOT change aggregation for identical validated assessments. Native probability outputs SHALL remain untrusted and SHALL NOT establish authenticated action facts.

#### Scenario: Identical assessments from two providers
- **WHEN** TypeSafe and APUS produce identical validated rule assessments under identical configuration
- **THEN** Tenet produces identical decisions, diagnostics, and approval requirements

#### Scenario: Unsupported exemption or invalid integrity
- **WHEN** APUS selects unsupported NOT_APPLICABLE or produces an integrity answer that violates the current contract
- **THEN** existing validation or blocking gates reject it regardless of model confidence

### Requirement: Bounded cancellation and failure
All native requests for an assessment SHALL share its cancellation signal and whole-assessment deadline. Cancellation or failure SHALL prevent further questions and discard late responses. A partial assessment SHALL remain unavailable, not passing. Tenet SHALL NOT retry automatically or substitute another provider, and SHALL NOT claim that client cancellation proves backend CPU work stopped.

#### Scenario: Timeout between questions
- **WHEN** the deadline expires after one question but before the assessment is complete
- **THEN** the assessment reports timeout, remaining questions are not submitted, and partial scores do not authorize the invocation

#### Scenario: Off or lifecycle invalidation
- **WHEN** activation changes to off or the invocation's generation becomes invalid
- **THEN** pending transport is cancelled and late answers cannot produce permission or current findings

#### Scenario: Unavailable selected model
- **WHEN** a native request fails
- **THEN** Tenet uses the existing mode-specific unavailable behavior, without retries, provider fallback, or a fabricated outcome

### Requirement: Correct provider and model identity
New local records SHALL identify the provider, expected requested model, backend-reported returned model, and native rendering contract. A missing or conflicting returned model identity SHALL reject the local assessment. Model identity SHALL NOT imply proof of physical weights or calibration. Historical records SHALL retain their recorded identities and contract versions.

#### Scenario: Wrong model at the configured port
- **WHEN** the backend reports a model identity different from the configured expectation
- **THEN** the assessment is unavailable and cannot be attributed to the expected APUS model

#### Scenario: Local assessment is archived
- **WHEN** APUS returns a validated assessment
- **THEN** the record identifies APUS rather than the hard-coded `jev-latest` request identity
- **AND** earlier TypeSafe and custom-judge records are not rewritten

### Requirement: Existing capture and disclosure controls
Local evaluation SHALL use the existing recording opt-out, bounded snapshots, credential omission, and owner-only diagnostic channels. It SHALL capture reproducible request mapping and rendering identity only under existing capture controls. Model errors, credentials, and submitted state SHALL NOT be copied into new always-on logs or agent-facing findings.

#### Scenario: Capture disabled
- **WHEN** `TENET_RECORDING=off` is set and no explicit external sink exists
- **THEN** local assessment creates no raw request or response archive
- **AND** the owner is still told that policy and selected evidence are sent to Pika

#### Scenario: Secret-bearing provider error
- **WHEN** a failed local response contains an arbitrary body or sensitive fields
- **THEN** safe diagnostics expose the failure category, not the body or credentials

### Requirement: Non-blocking experimental rollout
APUS support SHALL be labelled experimental. In observe mode, the existing bounded background path SHALL release tool calls independently of delayed assessment, and missing, dropped, or late results SHALL not be presented as passes. Installing or selecting APUS SHALL NOT turn on enforcement or imply validated semantic accuracy.

#### Scenario: Slow background assessment
- **WHEN** APUS takes longer than a tool call in observe mode
- **THEN** Tenet reports the assessment as pending or later unavailable/completed without changing the call's already released permission

#### Scenario: First successful classification
- **WHEN** a small synthetic APUS case matches its expected label
- **THEN** reporting separates successful execution and label matching from calibration, full-payload latency, host coverage, and enforcement accuracy

### Requirement: Owner-operated private runtime
Setup guidance SHALL keep the Pika model server loopback-only and use an owner-operated SSH tunnel from the Tenet machine. It SHALL require a persistent server, matching model alias, sufficient context, and explicit live-evaluation consent before sending real evidence. Tenet SHALL NOT install models, start services, open public ports, or manage SSH sessions automatically.

#### Scenario: Setup remains owner-controlled
- **WHEN** the owner selects APUS but has not started its server or forwarding
- **THEN** configuration remains locally inspectable while actual assessment reports connectivity failure
- **AND** Tenet makes no attempt to install or start either process

#### Scenario: Offline acceptance
- **WHEN** the normal verification suite runs
- **THEN** tests use scripted transport and temporary settings with no Pika requests, TypeSafe quota, model inference, or executed fixture actions
