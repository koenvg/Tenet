# Evidence-gap diagnostics

## Purpose

Explain runtime-observed evidence coverage and information loss without confusing them with model judgments, policy violations, permission decisions or execution outcomes.

## ADDED Requirements

### Requirement: Runtime evidence context independent of semantic gates
TENET SHALL produce a bounded, versioned evidence-context diagnostic from the current invocation's captured evidence. It SHALL distinguish unsupported, authenticated-partial and authenticated-complete action resolution, recorded resolver limitations, current redaction and history-selection loss. These diagnostics SHALL describe runtime-observed coverage, not assert which missing fact caused a model outcome. A model-selected UNKNOWN or INSUFFICIENT SHALL NOT gain an invented rationale. Evidence context SHALL NOT add or remove gates, change confidence thresholds, count as authorization or supply authenticated facts.

#### Scenario: Unsupported resolution with UNKNOWN outcomes
- **WHEN** current resolution is unsupported and validated rules select UNKNOWN
- **THEN** TENET reports both observations separately without claiming that resolver absence proves the cause of every UNKNOWN

#### Scenario: No history omissions but unresolved execution effects
- **WHEN** retained history is complete within its recorded capture and current effect coverage is partial
- **THEN** the diagnostic still reports partial action coverage and does not equate complete history with complete effects

#### Scenario: No valid assessment
- **WHEN** an evaluator response is unavailable or invalid
- **THEN** known runtime coverage remains reportable without fabricated rule scores, outcomes or blocking contributions

### Requirement: Consistent recorded and live reporting
The SDK's owner-facing assessment results and events, host owner reports and decision recordings SHALL carry the same sanitized evidence-context value for an invocation. The inspector SHALL use recorded diagnostic values for new records. Diagnostics SHALL remain bounded and immutable, follow existing privacy rules and preserve the invocation's recorded evidence and assessment contract identities. Diagnostic delivery failure SHALL NOT authorize an action or turn a denied action into a released one.

#### Scenario: Matching owner event and archive
- **WHEN** an invocation emits an owner assessment event and records a decision
- **THEN** both identify the same resolution status, limitations and history-selection summary

#### Scenario: Diagnostic listener fails
- **WHEN** an owner listener throws while receiving evidence context
- **THEN** enforcement consequences and approval requirements remain unchanged

### Requirement: Distinguish uncertainty from reported violation
The inspector SHALL distinguish a validated selected FAIL from an uncertainty-only blocking decision and from assessment unavailability. Where all recorded rule assessments are valid and none selected FAIL, it SHALL state that no rule was classified as violated, without asserting that the action is safe. Missing or invalid assessment stages SHALL prevent that statement. The inspector SHALL expose evidence context beside the explanation and retain per-rule gates and recorded thresholds.

#### Scenario: Completed uncertainty-only assessment
- **WHEN** a completed validated assessment has blocking uncertainty gates and no selected FAIL
- **THEN** its explanation identifies uncertainty and says no rule was classified as violated, rather than calling the action a violation or an all-clear

#### Scenario: Incomplete archive
- **WHEN** required assessment data is missing from an invocation
- **THEN** the inspector identifies the missing data and does not infer that there were no violations

### Requirement: Independent decision permission and execution
Evidence explanations SHALL preserve the separation between counterfactual observe-mode decisions, enforce-mode decisions, permission, approval and recorded execution. An uncertainty-only would-block finding in observe mode SHALL NOT be presented as having stopped execution. Released permission SHALL NOT prove execution or policy compliance.

#### Scenario: Observed call executed despite would-block
- **WHEN** an observe-mode invocation has a recorded would-block decision and executed result
- **THEN** the inspector shows the finding and execution as separate facts and explains that observation did not enforce the decision

#### Scenario: Permission without result
- **WHEN** permission was released but no execution result was captured
- **THEN** execution remains unknown regardless of the evidence diagnostic

### Requirement: Explicit historical diagnostic availability
The reader SHALL preserve supported historical schemas and assessment versions. New diagnostic fields SHALL have an explicit recording schema identity. Older records without them SHALL show diagnostic availability as not recorded; recorded raw evidence SHALL remain accessible. The reader SHALL NOT infer that absent diagnostics mean full coverage or reinterpret a historical decision with current configuration.

#### Scenario: Earlier recording schema
- **WHEN** a supported older invocation lacks evidence-context fields
- **THEN** its decision and thresholds retain their historical meaning and its diagnostic summary says not recorded
