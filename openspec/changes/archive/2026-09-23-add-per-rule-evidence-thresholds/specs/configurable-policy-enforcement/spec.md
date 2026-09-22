## ADDED Requirements

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
