# Inspector call status

## Purpose

Let owners see what actually happened to a recorded call before inspecting its assessment, without confusing observation findings with enforced permission or execution.

## ADDED Requirements

### Requirement: Execution-first call status
The inspector SHALL use the same primary status semantics in call lists and invocation summaries. A recorded successful tool result SHALL display Ran; a recorded failed result SHALL display Failed. Without a recorded result, actual blocked TENET permission SHALL display TENET blocked, released permission SHALL display Released with execution unknown, and missing permission SHALL display Execution unknown. Mode SHALL remain visible separately. Assessment decisions, approval outcomes and absence of a result SHALL NOT independently establish whether a call ran or was stopped. A failed result SHALL NOT establish that the action had no external effects.

#### Scenario: Observation call ran despite a blocking assessment
- **WHEN** a call has observe mode, a BLOCK assessment, released permission and a successful execution result
- **THEN** both its list entry and summary show Ran as the primary status and Observe as its mode
- **AND** the assessment does not appear as an actual TENET block

#### Scenario: Released call has no result
- **WHEN** permission was released but no execution result was recorded
- **THEN** the primary status says Released and explicitly identifies execution as unknown
- **AND** it does not say Ran, Failed or TENET blocked

#### Scenario: Actual enforcement block
- **WHEN** actual permission was blocked and no execution result was recorded
- **THEN** the primary status says TENET blocked even when the recorded reason is uncertainty rather than a suspected violation

#### Scenario: Tool failure after permission
- **WHEN** a call has released permission and a failed tool result
- **THEN** the primary status says Failed and explains that this is a tool result, not a policy block or proof of no external effects

#### Scenario: Decision without permission or execution
- **WHEN** a historical or incomplete record contains BLOCK but has no recorded permission or execution
- **THEN** the primary status is Execution unknown and the recorded assessment remains independently inspectable

### Requirement: Findings and counterfactual decisions remain separate
The inspector SHALL present finding categories independently of primary call status, using recorded labels, gates and lifecycle stages. Observe-mode confidence or evidence uncertainty SHALL use an amber uncertainty presentation, not a red actual-block badge or actual-block icon. Suspected violations, approval conditions, evaluator unavailability and pending, dropped, cancelled or incomplete assessments SHALL remain separately identifiable, including overlapping categories. Rule severity SHALL remain visible. Observe-mode BLOCK and ASK assessments SHALL be identified as what enforcement would do, not permission or approval that occurred. Styling SHALL NOT hide suspected violations or redefine an actual enforcement block as a passing call.

#### Scenario: Confidence-only observation finding
- **WHEN** an executed observe-mode call has only low-confidence or unresolved-applicability gates and no FAIL outcome
- **THEN** its finding is amber Assessment uncertainty
- **AND** its secondary assessment reads Would block in enforce mode without implying execution was blocked

#### Scenario: Observed suspected violation
- **WHEN** an observe-mode call ran and a rule selected FAIL
- **THEN** Ran remains its execution status and Suspected violation remains a distinct visible finding with its severity
- **AND** the inspector does not claim TENET stopped the call

#### Scenario: Observation approval condition
- **WHEN** an observe-mode assessment selected ASK
- **THEN** the inspector describes Would ask for approval in enforce mode and states that observation did not request approval
- **AND** it does not treat the assessment as actual approval or authorization

#### Scenario: Missing assessment is not an all-clear
- **WHEN** permission or execution is recorded but assessment is pending, dropped, cancelled, unavailable or incomplete
- **THEN** the inspector displays that assessment state without fabricating ALLOW, BLOCK or a passing finding

#### Scenario: Overlapping finding categories
- **WHEN** a call has both a FAIL outcome and confidence uncertainty
- **THEN** both categories remain visible rather than being reduced to a single uncertainty or violation label

### Requirement: Historical and contradictory facts remain interpretable
The inspector SHALL derive presentation from the supported invocation's recorded facts, never current thresholds, current policy or a rerun of the evaluator. Missing historical fields SHALL remain unknown. If recorded permission and execution conflict, the inspector SHALL display the recorded execution result and a visible inconsistency notice that preserves actual permission; it SHALL NOT silently resolve the conflict or imply that the current guard authorized the action. Existing invocation links, exact evidence, recorded questions, category counts, grouping and partial-coverage warnings SHALL remain available.

#### Scenario: Historical observation block
- **WHEN** an older supported record has observe mode, BLOCK, released permission and an executed result
- **THEN** the new presentation shows Ran and a separate counterfactual while preserving the original decision and question version

#### Scenario: Contradictory recorded permission
- **WHEN** a supported invocation records blocked permission and a successful execution result
- **THEN** the inspector shows Ran, retains the blocked permission and prominently identifies the inconsistent records
- **AND** it does not rewrite either stage or infer why execution occurred

#### Scenario: Reader exposes only a supported subset
- **WHEN** indexing is incomplete or archive issues make coverage partial
- **THEN** the status change preserves the existing coverage warning and does not represent visible calls as a complete session audit
