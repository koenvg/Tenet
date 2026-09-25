# Configurable policy enforcement delta

## ADDED Requirements

### Requirement: Explicit applicability-aware assessment profile
TENET SHALL retain the legacy assessment profile as the default and offer a separately selected, versioned applicability-aware profile. Profile selection SHALL be process-level, captured per invocation and independent of observe/enforce mode. The new profile SHALL add NOT_APPLICABLE without removing PASS, APPROVAL_REQUIRED, FAIL or UNKNOWN. It SHALL assess the entire invocation independently against each complete rule, without domain-specific shared prompt branches or tool-name exemptions. A NOT_APPLICABLE result SHALL contribute no blocking or approval gate only when its selected-outcome probability meets the existing outcome threshold and authenticated, fresh action facts cover all effects material to that rule. That supported result SHALL not require a separate evidence-confidence score. Scores below the threshold, incomplete facts, unsupported semantics or material rule ambiguity SHALL not obtain this exemption. Irrelevance remains a fallible assessment, not a safety proof.

#### Scenario: Supported read under a non-triggering rule
- **WHEN** the applicability profile classifies a fully described, authenticated file read as NOT_APPLICABLE to a Git-commit prohibition at or above the outcome threshold
- **THEN** that rule contributes no block and does not fail a separate evidence-confidence gate

#### Scenario: Read can itself violate policy
- **WHEN** a rule prohibits reading a particular resource and the invocation reads that resource
- **THEN** its read-only nature does not exempt the invocation from that rule

#### Scenario: Unsupported or opaque action
- **WHEN** a model selects NOT_APPLICABLE for an action without complete authenticated material facts
- **THEN** TENET treats that rule as unresolved, does not accept the exemption, and blocks for a BLOCK rule in enforce mode

#### Scenario: One harmless operation does not clear a compound action
- **WHEN** an invocation edits a file and then creates a commit
- **THEN** a non-triggering edit does not make the no-commit rule irrelevant to the entire invocation

#### Scenario: Relevant uncertainty is not consent
- **WHEN** a BLOCK rule has missing material facts, a selected FAIL or UNKNOWN, or unresolved policy integrity
- **THEN** enforcement remains blocked and neither prior approval nor an unrelated NOT_APPLICABLE result clears the blocker

#### Scenario: Explicit profile rollback
- **WHEN** the owner restarts with the legacy profile
- **THEN** existing legacy labels and gates apply to new calls and historical applicability decisions are not reinterpreted

### Requirement: Safe probability precision handling
TENET SHALL diagnose invalid response shape, labels, ranges, sums and selected-choice ordering separately with bounded structured reason codes. Only a versioned provider adapter backed by a verified precision contract SHALL accept rounding-scale deviations from a unit probability sum. It SHALL retain the original response and precision metadata, reject missing/nonfinite/negative/out-of-range values and incompatible labels, and avoid renormalizing scores into passing a decision threshold. Where documented rounding leaves threshold or selected-choice ordering ambiguous, the result SHALL remain uncertain or unavailable rather than an all-clear. Without a verified contract, strict rejection SHALL remain in place with a clear precision-incompatibility diagnostic. A precision accommodation SHALL not clear unrelated blocking gates.

#### Scenario: Distribution totals 0.99 without a verified contract
- **WHEN** a returned distribution totals 0.99 and no verified provider precision contract permits it
- **THEN** TENET rejects it with a probability-sum diagnostic and records evaluator unavailability

#### Scenario: Verified rounded response away from thresholds
- **WHEN** a verified contract bounds the distribution's rounding error and the accepted score intervals are wholly on one side of every applicable gate
- **THEN** the adapter can evaluate those gates using the conservative intervals while retaining raw scores and the adapter version

#### Scenario: Rounding straddles an enforcement boundary
- **WHEN** a documented score interval straddles 0.90 for a gate configured at 0.90
- **THEN** rounding alone cannot turn the result into permission

### Requirement: Friction regression evidence and promotion
TENET SHALL maintain sanitized fixtures for the reported file reads, brace insertion, code and documentation edits, staging without committing, actual commits, merges with known and unknown commit effects, compound edit-and-commit, active-policy mutation, approval-required publication, opaque execution, forged facts and provider precision cases. Expected labels SHALL be authored before evaluating a candidate. Reports SHALL distinguish semantic misclassification, uncertainty-only blocks, unavailable assessments, unnecessary approvals and unsafe allows with explicit denominators. Every comparison SHALL retain policy, profile, question and fixture identities, thresholds, returned model, evidence coverage and omissions. Offline scripted responses SHALL not establish semantic accuracy. No fixture action SHALL execute. Live replay and promotion of the new profile to the default SHALL require separate explicit owner authorization; this proposal supplies neither.

#### Scenario: Regression suite is offline
- **WHEN** the ordinary test suite runs without live authorization
- **THEN** it verifies deterministic mechanics and fixture contracts without contacting TypeSafe or executing any proposed action

#### Scenario: Candidate reduces false blocks but misses a prohibition
- **WHEN** a candidate improves benign cases but allows a protected actual-commit, policy-mutation or unapproved-publication control
- **THEN** the report exposes that unsafe allow and the candidate is not eligible for default promotion

#### Scenario: Corpus misses evaluation results
- **WHEN** a replay contains skipped, unavailable or incomplete rows
- **THEN** those rows remain visible with denominators and are not credited as semantic successes

## MODIFIED Requirements

### Requirement: Generic evaluator compatibility and validation
TENET SHALL retain the legacy PASS, APPROVAL_REQUIRED, FAIL and UNKNOWN outcomes, separate evidence sufficiency assessments, existing confidence thresholds and enforcement-mode aggregation under the legacy profile. The explicitly selected applicability-aware profile SHALL extend this contract only as specified by Explicit applicability-aware assessment profile. Changed evaluator instructions and response schemas SHALL have distinct versions. Domain-specific scenarios SHALL remain evaluation data or owner-authored policy text rather than shared evaluator instructions. Whole-response validation SHALL remain mandatory, subject only to Safe probability precision handling. Offline scripted verification SHALL NOT be represented as evidence of live semantic accuracy.

#### Scenario: Stable enforcement for identical assessments
- **WHEN** the same validated legacy per-rule assessments and configuration are supplied before and after this change
- **THEN** aggregate decisions, diagnostics, advisory handling and invocation-local approval behavior remain unchanged

#### Scenario: Cross-domain evaluation
- **WHEN** the generic evaluator is validated
- **THEN** fixtures cover unrelated rule domains, equivalent effects through different mechanisms, non-triggering actions, compound invocations, approval conditions, prohibitions and material uncertainty
- **AND** existing local-action regression cases remain present without domain guidance in the evaluator

#### Scenario: Live evaluation not authorized
- **WHEN** only offline verification is authorized
- **THEN** no live provider requests or fixture actions execute and semantic accuracy remains explicitly unverified

#### Scenario: Response profile mismatch
- **WHEN** a response uses applicability-only labels for an invocation captured with the legacy profile
- **THEN** TENET rejects the response rather than silently changing that invocation's decision semantics

### Requirement: Independent effective evidence thresholds
For each user rule assessed with an evidence-confidence gate, TENET SHALL use its declared override when present, otherwise the global evidence threshold. The global evidence threshold SHALL continue to default to 0.90 and remain configurable through `TENET_EVIDENCE_THRESHOLD`. Built-in integrity SHALL use the global evidence threshold and SHALL NOT inherit any user rule's override. The selected-outcome threshold SHALL remain global and unchanged. Exact scores equal to their effective thresholds SHALL pass their confidence gates; documented precision intervals SHALL follow Safe probability precision handling. A supported NOT_APPLICABLE result in the explicit applicability-aware profile SHALL have no evidence-confidence gate and SHALL record that gate as not applicable, not as a fabricated passing probability.

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
TENET SHALL preserve the effective thresholds and assessment profile for every assessed rule in decision contribution records, including passing rules, and SHALL use the same values in blocking diagnostics, owner reports, inspector views and offline replay output. Historical displays SHALL use recorded values rather than recomputing from the current policy or profile. Older records without per-rule values SHALL retain the existing global-configuration fallback or unavailable indication when no threshold was recorded. Legacy profile attribution SHALL be marked as historical inference where not explicitly recorded. Missing or invalid assessments SHALL NOT acquire fabricated scores or contributions. A supported NOT_APPLICABLE result SHALL explicitly identify its omitted evidence gate without inventing evidence confidence.

#### Scenario: Passing rule with an override
- **WHEN** a rule passes using 0.80 while the global threshold is 0.90
- **THEN** its recorded contribution and inspector threshold show 0.80 even though it has no blocking diagnostic

#### Scenario: Historical policy differs
- **WHEN** an archived invocation is viewed after its policy or assessment profile has changed
- **THEN** the inspector shows the invocation's recorded thresholds and profile, not current settings

#### Scenario: Offline verification
- **WHEN** scripted replay evaluates fixtures containing overrides, inherited thresholds and applicability contributions
- **THEN** output identifies the actual effective gates per assessed rule without provider requests or executing fixture actions

### Requirement: Bundled policy evidence configuration
The bundled policy SHALL configure `Never send any email without confirmation.` with explicit BLOCK severity and an evidence threshold of 0.80. Publication and commit rules SHALL remain without overrides, inheriting the global 0.90 default. The bundled commit rule SHALL explicitly prohibit creating a Git commit while clarifying that reading, editing and staging files alone do not violate that rule. It SHALL not add an approval exception to that prohibition. This configuration SHALL use the generic metadata mechanism rather than domain-specific matching. Upgrades SHALL not silently rewrite external owner policies.

#### Scenario: Bundled policy at default configuration
- **WHEN** the bundled policy is loaded with default global settings
- **THEN** email uses 0.80 and publication, commit and built-in integrity use 0.90
- **AND** every selected-outcome threshold remains 0.90

#### Scenario: Edit and stage without commit
- **WHEN** an invocation only edits or stages ordinary project files under the clarified bundled rule
- **THEN** its intended no-commit classification is non-violating without exempting it from other rules or policy integrity

#### Scenario: Actual commit after an owner request
- **WHEN** an invocation creates a Git commit while the recorded policy still contains the unconditional bundled prohibition
- **THEN** the intended classification remains FAIL; a different approval-based policy requires an explicit owner policy change
