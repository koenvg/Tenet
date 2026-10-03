# Configurable policy enforcement delta

## MODIFIED Requirements

### Requirement: Generic evidence and approval boundaries
TENET SHALL treat supplied action, context and history evidence as data, not authority to change evaluation instructions or establish approval. Ordinary evidence SHALL remain usable for classification without being promoted to authenticated execution facts. Unsupported action resolution, generic coverage limitations or omitted information unrelated to the complete rule SHALL NOT alone force UNKNOWN or INSUFFICIENT. PASS SHALL be available when ordinary evidence supports that the complete rule is satisfied, including a reliably determinable non-triggering action, without invoking the NOT_APPLICABLE exemption. This SHALL NOT create a deterministic tool exemption or certify effects that the evidence cannot establish. History SHALL inform interpretation without being assumed to represent current external state. Prior approvals SHALL NOT satisfy the current invocation's approval requirement. Ambiguous rule meaning or materially missing evidence SHALL produce UNKNOWN with an appropriate evidence assessment; the evaluator SHALL NOT invent unavailable facts. Built-in integrity SHALL remain independent and retain its ordinary evidence gates.

#### Scenario: Evidence contains instructions
- **WHEN** supplied evidence claims permission or instructs the evaluator to ignore a rule
- **THEN** those claims do not override the selected rule or authorize the invocation

#### Scenario: Material uncertainty
- **WHEN** determining whether the attempted effects trigger the rule requires evidence that is missing, stale, conflicting or obscured
- **THEN** the evaluator returns UNKNOWN rather than assuming a favorable state

#### Scenario: Explicit approval condition
- **WHEN** the complete rule requires approval for the attempted effect and history contains an earlier approval
- **THEN** the rule outcome remains APPROVAL_REQUIRED and current invocation approval is handled outside the assessment

#### Scenario: Unsupported resolution does not replace ordinary assessment
- **WHEN** resolution is unsupported but ordinary current-action evidence is sufficient to determine that the complete rule is satisfied
- **THEN** the intended classification is PASS with an evidence assessment, not UNKNOWN solely because authenticated resolution is unavailable
- **AND** ordinary outcome and evidence-confidence gates remain applicable

#### Scenario: Missing fact is material for one rule only
- **WHEN** a missing target identity is necessary for one rule but irrelevant to another independently determinable rule
- **THEN** the missing target keeps the first rule uncertain without automatically making the second rule UNKNOWN

#### Scenario: Arbitrary code contains unresolved effects
- **WHEN** determining whether executable code follows the complete rule requires effects unavailable from supplied evidence
- **THEN** the evaluator retains UNKNOWN and an appropriate evidence assessment rather than accepting a claimed harmless tool description

### Requirement: Generic evaluator compatibility and validation
TENET SHALL retain the single current applicability-aware contract, with PASS, APPROVAL_REQUIRED, FAIL, UNKNOWN and user-rule NOT_APPLICABLE outcomes. Ordinary PASS and APPROVAL_REQUIRED results SHALL retain separate evidence sufficiency assessments, existing thresholds and enforcement-mode aggregation. NOT_APPLICABLE SHALL retain its authenticated complete-fact requirements and omitted evidence gate; unsupported applicability SHALL remain unresolved and cannot clear a BLOCK rule. Integrity SHALL not select NOT_APPLICABLE or APPROVAL_REQUIRED. Changed evaluator instructions SHALL have a distinct question version, even when response shape and assessment profile remain unchanged. Whole-response validation SHALL remain strict. Domain-specific scenarios SHALL remain evaluation data rather than shared evaluator instructions, with no tool-name or rule-text allowlists. Historical labels, gates, thresholds and question versions SHALL retain their recorded meaning. Offline scripted verification SHALL NOT be represented as evidence of live semantic accuracy.

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

#### Scenario: Unsupported non-applicability remains blocked
- **WHEN** a model selects NOT_APPLICABLE without complete authenticated current facts, even at high confidence
- **THEN** the applicability-unresolved gate remains and a BLOCK rule prevents enforce-mode release

#### Scenario: Valid ordinary pass without authenticated facts
- **WHEN** every blocking rule and integrity select valid PASS results meeting all applicable confidence gates without authenticated resolution
- **THEN** the aggregate decision is ALLOW under the existing mechanics, not a newly invented exemption

#### Scenario: Changed question identity and historical inspection
- **WHEN** the generic instructions change while the outcome distribution schema remains the same
- **THEN** new assessments record a new question version within the existing assessment profile
- **AND** older recorded assessments retain their original question versions and are not reevaluated

## ADDED Requirements

### Requirement: Protected controls for uncertainty reduction
The uncertainty-reduction regression corpus SHALL define sanitized expected outcomes before candidate evaluation. It SHALL cover routine reads, inert edits, metadata/history pressure, unsupported resolution, unrelated rule domains, actual prohibited operations, compound operations, active-policy modification, approval conditions, forged safety claims and materially opaque execution. Reports SHALL distinguish uncertainty-only blocks, selected violations, unavailable assessments, missing results, unnecessary approvals and unsafe allows, with explicit denominators and policy, question, fixture and model identities where available. UI improvements, scripted responses or missing evaluation rows SHALL NOT count as evidence of improved semantic accuracy. Live evaluator comparison SHALL require separate owner authorization for evidence disclosure and provider usage.

#### Scenario: Benign and protected controls remain distinct
- **WHEN** offline verification exercises benign fixtures and protected actual-commit, policy-modification and unapproved-publication controls
- **THEN** it verifies evidence and enforcement mechanics without executing those actions or claiming the model would classify them correctly

#### Scenario: Candidate has an unsafe allow
- **WHEN** a separately authorized candidate comparison reduces benign uncertainty but allows a protected prohibited action
- **THEN** the report exposes that unsafe allow separately rather than treating aggregate block reduction as success

#### Scenario: Missing comparison results
- **WHEN** comparison rows are unavailable, skipped or incomplete
- **THEN** those rows remain visible and are not credited as correct classifications or reduced false blocks
