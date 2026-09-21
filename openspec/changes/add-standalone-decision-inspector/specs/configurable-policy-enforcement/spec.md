## MODIFIED Requirements

### Requirement: Safe diagnostic payloads
Agent-visible diagnostic output SHALL use validated labels, numeric scores, gate identifiers and bounded rule references rather than provider prose or raw action arguments. Tool-call correlation and question identity SHALL be retained. A separate local owner-facing evidence archive SHALL record submitted application-level requests by default, including the bounded, field-redacted action and trajectory actually supplied to the evaluator, under the decision-recording requirements. This archive SHALL NOT enable transport credential logging, unbounded full-session logging, or automatic delivery of evidence to the agent. Existing diagnostic channels SHALL NOT acquire raw request payloads. Recording SHALL NOT change enforcement decisions.

#### Scenario: Secret embedded in action text
- **WHEN** an assessed invocation contains a secret in a shell string
- **THEN** structured decision records and block explanations do not copy that string, while the separate local archive can retain it if it was part of the submitted evidence and its privacy guidance explicitly warns of this risk

#### Scenario: Evidence recording disabled
- **WHEN** the owner disables local evidence recording
- **THEN** existing safe diagnostics and enforcement continue without new archived request payloads

#### Scenario: Archive isolated from model evidence
- **WHEN** a submitted request is saved to the local archive
- **THEN** the payload is not appended to Pi agent messages, tool results or recovered evaluator trajectory
