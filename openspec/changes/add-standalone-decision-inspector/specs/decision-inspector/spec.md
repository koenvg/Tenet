## Purpose

Let owners inspect TENET decisions in a standalone local application, tracing individual rule assessments back to the evidence and questions used.

## ADDED Requirements

### Requirement: Independent cross-project session browsing
The inspector SHALL start independently of Pi, read the local archive without contacting the evaluator, and list retained sessions across projects with project filtering, session ID, timestamps, concern counts and recording-health indicators. Selecting a session SHALL expose a paginated call timeline containing passes, concerns and unavailable assessments. Deep links SHALL identify the session and invocation without putting evidence content into URLs.

#### Scenario: Pi is stopped
- **WHEN** the owner starts the inspector after Pi exits
- **THEN** retained sessions and their recorded evidence remain browsable without starting Pi or making provider requests

#### Scenario: Project filter
- **WHEN** sessions from two working directories are recorded
- **THEN** the owner can filter by project and select each session by its original session ID

### Requirement: Rule-first decision inspection
For each recorded invocation, the inspector SHALL show every assessed rule, its snapshot text, source line, enforcement setting, selected outcome, full probability distributions, evidence sufficiency, effective thresholds and triggered gates. Built-in integrity SHALL be distinguished from TENET.md declarations. Selecting a rule SHALL link to its actual submitted questions and choices and the shared submitted evidence, including action metadata, arguments, context and chronological history with omission/redaction markers. The UI SHALL distinguish reported FAIL, UNKNOWN, confidence gates, approval requirements and unavailable assessment; a blocking gate SHALL NOT automatically be labeled a rule violation.

#### Scenario: Passing label below threshold
- **WHEN** PASS is selected at 0.88 with an outcome threshold of 0.90
- **THEN** the UI identifies low outcome confidence as the gate and does not claim the evaluator selected FAIL

#### Scenario: Policy changed after recording
- **WHEN** TENET.md or question-building code changes after an invocation
- **THEN** inspection still shows the recorded policy and questions and does not substitute current content

#### Scenario: Why a rule failed
- **WHEN** the owner selects a rule assessed as FAIL
- **THEN** the UI exposes the submitted question, choices, evidence, response and deterministic gates without claiming access to the provider's hidden reasoning

### Requirement: Live and incomplete lifecycle visibility
While open, the inspector SHALL discover newly persisted sessions and invocation stages without a manual page reload. It SHALL separately display counterfactual enforcement, actual permission, approval outcome and observed execution. Missing, unsupported or corrupt stages SHALL be explicitly marked; absence SHALL NOT be interpreted as passing or successful execution. Historical data lacking exact evidence SHALL NOT be reconstructed or labeled exact.

#### Scenario: New response arrives
- **WHEN** the inspector is open on an invocation whose response is newly persisted
- **THEN** the response and available downstream stages appear without resetting the selected invocation

#### Scenario: Missing tool result
- **WHEN** permission was released but no execution record exists
- **THEN** execution remains unknown regardless of assessment outcome

#### Scenario: Missing historical payload
- **WHEN** a record contains a decision but no submitted evidence
- **THEN** the inspector labels evidence unavailable rather than loading current source or unrelated session history

### Requirement: Read-only local access boundary
The inspector SHALL expose only read operations over the configured archive, bind only to loopback, reject unauthorized and cross-origin archive access, and prevent path traversal or arbitrary filesystem reads. Untrusted rule, evidence and response content SHALL render as inert text. It SHALL provide no approval, policy editing, tool execution or evaluator rerun operation. Closing the inspector SHALL NOT stop recording or affect enforcement.

#### Scenario: Hostile evidence text
- **WHEN** archived evidence contains script markup or instructions to execute a command
- **THEN** the inspector displays inert content and executes neither scripts nor commands from the record

#### Scenario: Untrusted web origin
- **WHEN** another website attempts to read the local archive API
- **THEN** the request is denied and no evidence is returned

#### Scenario: Inspector closed
- **WHEN** the owner closes the app during a Pi session
- **THEN** TENET continues recording and making the same enforcement decisions
