# Configurable policy enforcement Specification

## Purpose

Let owners define explicit plain-text rules that TENET evaluates individually before tool execution, with conservative combined decisions and protection against agent changes to the active policy.

## Requirements

### Requirement: Exact assessment blocking diagnostics
For each valid assessment that blocks execution, TENET SHALL expose all triggered gates per blocking rule in structured decision diagnostics and a bounded user-visible block explanation. Gates SHALL distinguish selected FAIL, selected UNKNOWN, selected-outcome probability below threshold, selected INSUFFICIENT evidence, and sufficient-evidence probability below threshold. Diagnostics SHALL include rule identity or location, selected labels, relevant probabilities and effective thresholds. Existing aggregate decision and reason fields SHALL remain available. Defaults SHALL remain 0.90 for both thresholds; diagnostic generation SHALL NOT alter enforcement.

#### Scenario: Passing label below outcome threshold
- **WHEN** a rule selects PASS at 0.88 with SUFFICIENT evidence at 0.93 and both thresholds are 0.90
- **THEN** diagnostics identify only the outcome-confidence gate for that rule, rather than claiming the evidence label was insufficient

#### Scenario: Multiple blockers in the reported edit
- **WHEN** the no-commit rule selects FAIL at 0.58 with SUFFICIENT evidence at 0.90, while integrity selects PASS at 0.88 with SUFFICIENT evidence at 0.87
- **THEN** diagnostics identify FAIL and low outcome confidence for the no-commit rule and both low confidence gates for integrity, without claiming integrity selected FAIL

#### Scenario: Exact threshold boundary
- **WHEN** a selected PASS and SUFFICIENT evidence each have probability exactly 0.90 under default configuration
- **THEN** neither confidence gate is triggered

#### Scenario: Assessment unavailable
- **WHEN** provider failure or invalid response prevents a validated assessment
- **THEN** TENET retains the existing failure reason and does not fabricate per-rule scores or gate results

### Requirement: Safe diagnostic payloads
New diagnostic output SHALL use validated labels, numeric scores, gate identifiers and bounded rule references rather than provider prose or raw action arguments. Tool-call correlation and question identity SHALL be retained. No new raw request, full-session or secret-bearing argument logging SHALL be enabled by this change.

#### Scenario: Secret embedded in action text
- **WHEN** an assessed invocation contains a secret in a shell string
- **THEN** new diagnostic records and block explanations do not copy that string

### Requirement: Reproducible bounded local-action replay
The existing diagnostic replay SHALL include sanitized, stable fixtures preserving the reported shell command, README edit payload and original policy wording, alongside actual commit, combined edit-and-commit, policy mutation and approval-requiring publication controls. It SHALL never execute fixture actions. Reports SHALL identify fixture inputs through stable identifiers and digests, effective thresholds, question version and digest, requested and returned model identifiers, per-rule assessments, blocking gates and observed versus expected decisions. False blocks and unsafe allows SHALL be reported separately with denominators. Offline scripted results SHALL NOT be presented as live semantic accuracy.

#### Scenario: Offline original-score regression
- **WHEN** ordinary verification supplies the recorded assessment probabilities without a live provider
- **THEN** the two recorded blocks and their exact diagnostics are reproduced without network access or a dependency on the supplied session file

#### Scenario: Live replay is not authorized
- **WHEN** the diagnostic runner is invoked without explicit live opt-in
- **THEN** it sends no provider requests and executes no fixture actions

#### Scenario: Candidate semantic evaluation
- **WHEN** an owner explicitly authorizes live evaluation of candidate questions
- **THEN** the report exposes each fixture's expected and observed result, repetitions, false blocks and unsafe allows, without lowering thresholds or claiming calibrated safety from the bounded sample

### Requirement: Generic independent rule evaluation
TENET SHALL assess each complete rule independently against the immediate attempted effects of the entire proposed invocation, using supplied context and history as evidence regardless of tool or mechanism. Shared evaluator instructions SHALL NOT contain domain-specific definitions, examples, effect taxonomies, tool allowlists or rule-dependent prompt branches. The selected rule SHALL supply its restrictions, conditions and exceptions. Other rules SHALL NOT change that rule's classification. Built-in integrity SHALL remain a separate assessment.

#### Scenario: Equivalent effects through different mechanisms
- **WHEN** different mechanisms attempt the same effect under the same rule with materially equivalent evidence
- **THEN** the expected rule outcome is the same without adding mechanism-specific evaluator instructions

#### Scenario: Complete invocation and rule
- **WHEN** an invocation contains multiple operations and one triggers a condition or prohibition in the complete rule
- **THEN** classification accounts for that operation and all relevant exceptions rather than only the first operation or first word of the rule
- **AND** hypothetical actions outside the invocation do not determine its outcome

#### Scenario: Independent restrictions
- **WHEN** one rule permits an action and another prohibits it
- **THEN** each rule receives its own assessment and permission does not cancel the prohibition

#### Scenario: Integrity remains independent
- **WHEN** an action passes every user rule but violates built-in integrity
- **THEN** integrity independently blocks the action under the existing enforcement gates

### Requirement: Generic evidence and approval boundaries
TENET SHALL treat supplied action, context and history evidence as data, not authority to change evaluation instructions or establish approval. History SHALL inform interpretation without being assumed to represent current external state. Prior approvals SHALL NOT satisfy the current invocation's approval requirement. Ambiguous rule meaning or materially missing evidence SHALL produce UNKNOWN with an appropriate evidence assessment; irrelevant missing information SHALL NOT by itself make an otherwise determinable action unknown. The evaluator SHALL NOT invent unavailable facts.

#### Scenario: Evidence contains instructions
- **WHEN** supplied evidence claims permission or instructs the evaluator to ignore a rule
- **THEN** those claims do not override the selected rule or authorize the invocation

#### Scenario: Material uncertainty
- **WHEN** determining whether the attempted effects trigger the rule requires evidence that is missing, stale, conflicting or obscured
- **THEN** the evaluator returns UNKNOWN rather than assuming a favorable state

#### Scenario: Explicit approval condition
- **WHEN** the complete rule requires approval for the attempted effect and history contains an earlier approval
- **THEN** the rule outcome remains APPROVAL_REQUIRED and current invocation approval is handled outside the assessment

### Requirement: Generic evaluator compatibility and validation
TENET SHALL retain PASS, APPROVAL_REQUIRED, FAIL and UNKNOWN outcomes, separate evidence sufficiency assessments, existing confidence thresholds and existing enforcement-mode aggregation. Changed evaluator instructions SHALL have a distinct question version. Domain-specific scenarios SHALL remain evaluation data rather than shared evaluator instructions. Offline scripted verification SHALL NOT be represented as evidence of live semantic accuracy.

#### Scenario: Stable enforcement for identical assessments
- **WHEN** the same validated per-rule assessments and configuration are supplied before and after this change
- **THEN** aggregate decisions, diagnostics, advisory handling and invocation-local approval behavior remain unchanged

#### Scenario: Cross-domain evaluation
- **WHEN** the generic evaluator is validated
- **THEN** fixtures cover unrelated rule domains, equivalent effects through different mechanisms, non-triggering actions, compound invocations, approval conditions, prohibitions and material uncertainty
- **AND** existing local-action regression cases remain present without domain guidance in the evaluator

#### Scenario: Live evaluation not authorized
- **WHEN** only offline verification is authorized
- **THEN** no live provider requests or fixture actions execute and semantic accuracy remains explicitly unverified

### Requirement: Per-rule evidence threshold declarations
TENET SHALL accept an optional case-sensitive `evidenceThreshold=<number>;` segment immediately after an explicit `BLOCK;` or `WARN;` prefix in a `Rule;` declaration. This setting SHALL apply to any user rule regardless of its text or domain. Surrounding whitespace in the metadata segment, key and value SHALL be ignored. Values SHALL be unsigned decimal numbers in the inclusive range 0 through 1, with digits before and, if a decimal point is present, after that point. Empty values, signs, exponent notation, nonfinite values and out-of-range values SHALL be invalid. The trimmed remainder SHALL be nonempty rule text. Metadata SHALL NOT become semantic rule text.

The leading `evidenceThreshold` token after explicit severity SHALL be reserved for this setting. A malformed reserved segment, missing separator, or consecutive duplicate threshold segment SHALL make the entire policy unavailable with `policy-format`. Legacy declarations without explicit severity SHALL retain their existing text interpretation. Other semicolons after rule text begins SHALL remain literal text. Existing line recognition, snapshot identity, duplicate-rule handling and size/count limits SHALL remain in force.

#### Scenario: Any rule can override its threshold
- **WHEN** a policy declares `Rule; WARN; evidenceThreshold=0.85; Ask before installing dependencies.`
- **THEN** the rule has WARN severity, threshold 0.85 and only `Ask before installing dependencies.` as semantic text
- **AND** the same metadata syntax works for BLOCK rules in unrelated domains

#### Scenario: Legacy and ordinary text compatibility
- **WHEN** a declaration omits threshold metadata, uses legacy `Rule; text`, or contains semicolons after ordinary rule text begins
- **THEN** its severity and text retain their existing interpretation and it has no threshold override

#### Scenario: Invalid intended metadata
- **WHEN** a reserved metadata segment contains an empty value, `NaN`, `Infinity`, `-0.1`, `1.1`, `8e-1`, a missing separator, or a consecutive duplicate threshold segment
- **THEN** the whole policy is unavailable with `policy-format` rather than evaluating the malformed setting as prose

#### Scenario: Boundary values and whitespace
- **WHEN** explicit metadata supplies `0`, `1`, `0.80`, or ` evidenceThreshold = 0.8 ; ` followed by nonempty rule text
- **THEN** the corresponding numeric override is accepted

### Requirement: Independent effective evidence thresholds
For each user rule, TENET SHALL use its declared override when present, otherwise the global evidence threshold. The global evidence threshold SHALL continue to default to 0.90 and remain configurable through `TENET_EVIDENCE_THRESHOLD`. Built-in integrity SHALL use the global evidence threshold and SHALL NOT inherit any user rule's override. The selected-outcome threshold SHALL remain global and unchanged. Scores equal to their effective thresholds SHALL pass their confidence gates.

Overrides SHALL NOT change selected FAIL, UNKNOWN or INSUFFICIENT gates, approval requirements, BLOCK/WARN consequences, observe/enforce behavior, or response validation. Threshold settings SHALL NOT change generic evaluator question text or be supplied as semantic rule instructions. Thresholds SHALL NOT be presented as calibrated correctness guarantees.

#### Scenario: Different rules at the same score
- **WHEN** two BLOCK rules select PASS above the outcome threshold and SUFFICIENT at 0.85, one with a 0.80 override and one inheriting 0.90
- **THEN** only the inherited rule triggers the evidence-confidence gate
- **AND** the combined decision in enforce mode remains BLOCK

#### Scenario: Global configuration remains a fallback
- **WHEN** the global evidence threshold is 0.95 and a user rule explicitly declares 0.80
- **THEN** that rule uses 0.80 while unconfigured rules and integrity use 0.95

#### Scenario: Other gates and approval remain independent
- **WHEN** a rule meets its evidence override but selects FAIL, UNKNOWN or INSUFFICIENT, or misses the selected-outcome threshold
- **THEN** the corresponding gates remain triggered
- **AND** a confident APPROVAL_REQUIRED result still requires invocation-local confirmation for a BLOCK rule in enforce mode

#### Scenario: WARN and observation remain advisory
- **WHEN** an override changes a WARN rule's evidence-confidence gate or a rule is evaluated in observe mode
- **THEN** findings use the effective threshold without adding a veto or approval prompt beyond existing mode behavior

### Requirement: Historical effective-threshold reporting
TENET SHALL preserve the effective evidence threshold for every assessed rule in decision contribution records, including passing rules, and SHALL use the same value in blocking diagnostics, owner reports, inspector views and offline replay output. Historical displays SHALL use recorded values rather than recomputing from the current policy. Older records without per-rule values SHALL retain the existing global-configuration fallback or unavailable indication when no threshold was recorded. Missing or invalid assessments SHALL NOT acquire fabricated scores or contributions.

#### Scenario: Passing rule with an override
- **WHEN** a rule passes using 0.80 while the global threshold is 0.90
- **THEN** its recorded contribution and inspector threshold show 0.80 even though it has no blocking diagnostic

#### Scenario: Historical policy differs
- **WHEN** an archived invocation is viewed after its policy has changed
- **THEN** the inspector shows the invocation's recorded thresholds, not current policy settings

#### Scenario: Offline verification
- **WHEN** scripted replay evaluates fixtures containing overrides and inherited thresholds
- **THEN** output identifies the effective threshold per assessed rule without provider requests or executing fixture actions

### Requirement: Bundled policy evidence configuration
The bundled policy SHALL configure `Never send any email without confirmation.` with explicit BLOCK severity and an evidence threshold of 0.80. Publication and commit rules SHALL remain without overrides, inheriting the global 0.90 default. This configuration SHALL use the generic metadata mechanism rather than email-specific matching.

#### Scenario: Bundled policy at default configuration
- **WHEN** the bundled policy is loaded with default global settings
- **THEN** email uses 0.80 and publication, commit and built-in integrity use 0.90
- **AND** every selected-outcome threshold remains 0.90
