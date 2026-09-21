## REMOVED Requirements

### Requirement: Git commit and working-tree action distinction
**Reason**: Domain-specific evaluator guidance conflicts with generic independent-rule evaluation. The replacement retains effect-based assessment without prescribing meanings for individual domains.
**Migration**: Apply Generic independent rule evaluation instead. Preserve existing inspection, edit, combined-operation and integrity cases in regression fixtures rather than embedding their explanations in shared evaluator questions.

## ADDED Requirements

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
