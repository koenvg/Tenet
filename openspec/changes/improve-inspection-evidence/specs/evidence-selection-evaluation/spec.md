# Evidence-selection evaluation

## Purpose

Measure evidence preparation and reporting changes across arbitrary policy domains while keeping offline mechanical verification distinct from live semantic accuracy.

## ADDED Requirements

### Requirement: Sanitized cross-domain regression fixtures
TENET SHALL maintain authored fixtures for a small pending inspection action after repeated large document history, with both exact duplicates and presentation-different echoes. The reported Git command SHALL appear only as sanitized fixture data, not as shared evaluator guidance or a tool-specific exemption. Fixtures SHALL also cover unrelated read restrictions, transmission restrictions, mutation restrictions, equivalent effects through unfamiliar tool names, context-dependent references, mixed compound effects, protected-policy changes, forged facts, stale facts and unavailable assessments. Expected mechanical behavior and policy labels SHALL be authored before any candidate evaluation. Private archive payloads, original session identifiers, local paths and credentials SHALL NOT enter the committed fixture corpus.

#### Scenario: Reported pattern reproduced offline
- **WHEN** the offline suite evaluates the sanitized inspection-history fixture
- **THEN** it verifies bounded current evidence, explicit history selection and unsupported coverage without executing the command or treating a scripted label as proof of semantic accuracy

#### Scenario: Equivalent effects with unrelated names
- **WHEN** fixture tools and reporting-only domain labels change without changing their evidence structure
- **THEN** selection behavior remains equivalent and no domain-specific shortcut appears

### Requirement: Evidence-selection comparisons keep policy fixed
A comparison SHALL apply recorded selection versions to the same sanitized action, policy, authenticated facts, authored expectations, effective thresholds and assessment question semantics. Every row SHALL retain fixture identity, policy digest, evidence-selection identity, question and assessment versions, resolution coverage, omissions and request bytes. Live rows SHALL additionally retain returned model identity, reported token usage and measured latency when available. Metric fields unavailable offline SHALL remain unavailable, not estimated provider performance. Expected labels and reporting-only fixture metadata SHALL NOT enter evaluator evidence.

#### Scenario: Compaction-only paired run
- **WHEN** a repeated-history fixture is compared with and without the candidate preparation
- **THEN** differences in content representation, omissions and request bytes are attributable to the recorded selector versions rather than changed policy or thresholds

#### Scenario: Scripted judge
- **WHEN** an injected offline judge supplies outcomes
- **THEN** the report labels the run as mechanical verification and does not claim improved live accuracy or provider token savings

### Requirement: Separate decision and coverage metrics
Comparison reports SHALL count reported violations, uncertainty-only blocks, assessment unavailability, approval requirements and unsafe allows separately with explicit denominators. Unsupported and partial action coverage SHALL remain visible. Skipped or failed rows SHALL NOT count as successes. Reduced request bytes SHALL NOT alone count as fewer false blocks, safe permission or calibrated accuracy. Removing causally necessary history SHALL be exposed by context-dependent controls.

#### Scenario: Cleaner evidence but same uncertainty
- **WHEN** compaction reduces request bytes while unsupported facts and blocking uncertainty remain
- **THEN** the report records the size reduction without claiming that enforcement friction was fixed

#### Scenario: Smaller request loses a necessary observation
- **WHEN** selection removes evidence required to interpret a context-dependent action
- **THEN** the control exposes the loss through retained omission metadata and authored expected behavior rather than crediting the row as a successful optimization

#### Scenario: Protected control allowed
- **WHEN** a candidate obtains a lower benign-block count but allows an authored prohibited action or unsupported applicability exemption
- **THEN** the report exposes the unsafe allow and does not present the candidate as a safety-preserving improvement

### Requirement: Offline default and explicit live authorization
Ordinary tests and builds SHALL use injected judges or recorded scripted responses without contacting an evaluator or executing fixture actions. A live comparison SHALL require separate explicit owner authorization for provider requests and sanitized evidence disclosure. It SHALL never execute fixture actions. Creating or implementing this change SHALL NOT itself authorize live replay, disclose private recordings or certify a deployed executor.

#### Scenario: CI without credentials
- **WHEN** the project verification commands run under normal CI conditions
- **THEN** evidence-selection fixtures complete without provider credentials, network evaluation or proposed-action execution

#### Scenario: Live authorization absent
- **WHEN** a live comparison is requested without explicit disclosure authorization
- **THEN** the comparison refuses submission before contacting the provider
