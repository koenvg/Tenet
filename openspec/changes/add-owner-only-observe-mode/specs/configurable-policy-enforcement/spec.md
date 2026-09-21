## ADDED Requirements

### Requirement: Observation by default with explicit enforcement
TENET SHALL default to `observe` when `TENET_MODE` is absent and SHALL activate enforcement only when it is explicitly `enforce`. In observe mode TENET MUST NOT veto tool execution, request approval, alter tool inputs or outputs, or throw a TENET failure through the tool-call boundary. This applies to rule findings, policy integrity, missing credentials, unavailable or stale policy, invalid configuration, unsupported evidence, invalid responses, provider errors, deadlines, cancellation, lifecycle invalidation and reporting failures. Host cancellation, host restrictions and tool failures remain outside this guarantee. An invalid mode SHALL select observe with an owner-visible configuration warning when reporting is available. Mode SHALL be fixed for the process and shown to the owner.

#### Scenario: First run
- **WHEN** no mode is configured and a rule selects FAIL
- **THEN** TENET permits the call without an approval prompt and reports the counterfactual enforcement result only to the owner

#### Scenario: Observation infrastructure failure
- **WHEN** any TENET evaluation, initialization, lifecycle or reporting path fails in observe mode
- **THEN** TENET returns control without a veto or agent-visible diagnostic, and reports evaluation unavailability where reporting remains possible

#### Scenario: Explicit enforcement
- **WHEN** the owner starts TENET with `TENET_MODE=enforce`
- **THEN** blocking rules, built-in integrity, configuration and operational failures retain conservative enforcement, with native approval only for eligible approval-required results

#### Scenario: Invalid mode
- **WHEN** `TENET_MODE` contains an unrecognized value
- **THEN** TENET observes without vetoes and reports the invalid setting to the owner rather than silently claiming enforcement

### Requirement: Per-rule enforcement settings
TENET SHALL accept `Rule; BLOCK; text` and `Rule; WARN; text`, retaining source line, snapshot identity and rule order. Legacy `Rule; text` SHALL mean BLOCK. Only exact uppercase BLOCK or WARN followed by a semicolon after the declaration prefix SHALL be consumed as enforcement metadata; other legacy text and its semicolons SHALL remain rule text. Empty rule text SHALL be invalid. Existing policy bounds SHALL remain. Enforcement settings SHALL NOT change semantic assessment labels or thresholds. WARN findings SHALL never independently block or request approval in either mode. BLOCK findings SHALL use the existing strict gates and approval semantics in enforce mode. The built-in integrity rule SHALL remain non-configurable and blocking only in enforce mode.

#### Scenario: Legacy rule
- **WHEN** a policy contains `Rule; Never delete; ask the owner instead.`
- **THEN** TENET retains the complete sentence as a BLOCK rule

#### Scenario: Mixed rule settings
- **WHEN** a WARN rule fails but BLOCK rules and integrity pass all gates
- **THEN** enforcement permits execution and reports the warning only to the owner

#### Scenario: Advisory approval condition
- **WHEN** a WARN rule selects APPROVAL_REQUIRED
- **THEN** TENET reports the finding without opening an approval prompt

#### Scenario: Blocking approval condition
- **WHEN** a BLOCK rule selects APPROVAL_REQUIRED with sufficient confidence and evidence and no blocking gates exist
- **THEN** observation reports would-ask without prompting, while enforcement requests invocation-bound approval

### Requirement: Owner-only observation reporting
Observation findings SHALL appear only in owner-facing non-model UI and bounded diagnostic records. TENET SHALL NOT inject these findings into agent messages, prompts, tool results, or later evaluator trajectory, including after session recovery. UI-less execution SHALL remain non-vetoing and retain records where supported without writing findings to the agent protocol. Owner-only means no automatic model delivery, not a filesystem confidentiality boundary. Reports SHALL distinguish selected FAIL, uncertainty gates, approval requirements and evaluation unavailability. Actual TENET permission, counterfactual enforcement decision and observed execution outcome SHALL remain separate. Unavailable assessments SHALL have no fabricated scores or claims of safety. Diagnostic payload restrictions from Safe diagnostic payloads SHALL apply.

#### Scenario: Reported passing labels
- **WHEN** BLOCK rules select PASS with outcome confidence 0.63 and sufficient-evidence confidence 0.89 respectively under 0.90 thresholds
- **THEN** the owner sees permitted execution with would-block and the respective uncertainty gates, not a claim that either rule selected FAIL

#### Scenario: Failure without an assessment
- **WHEN** the evaluator times out
- **THEN** observation reports evaluation unavailable and would-block due to timeout without per-rule scores or an all-clear result

#### Scenario: No feedback after recovery
- **WHEN** a session with saved observation findings is continued, forked or recovered
- **THEN** those findings remain absent from agent context and subsequent evaluator evidence

#### Scenario: Permission without execution
- **WHEN** TENET permits a call but no matching tool result arrives
- **THEN** reporting does not claim successful execution

## MODIFIED Requirements

### Requirement: Git commit and working-tree action distinction
TENET SHALL instruct its evaluator to distinguish creating a Git commit from reading, listing, editing or staging working-tree files when interpreting a Git commit prohibition. It SHALL assess every immediate operation in an invocation, not hypothetical later actions. This distinction SHALL NOT exempt actions from other rules or policy integrity, and SHALL NOT introduce tool-name allowlists or assume missing filesystem facts. Actual enforcement SHALL depend on global mode and per-rule enforcement settings.

#### Scenario: Reported inspection under original rule wording
- **WHEN** the invocation is `pwd; git status --short; ls -a | grep -Ei '^(readme.*|agents.md|claude.md)$'; find .. -name AGENTS.md -maxdepth 2 -print` under `Never commit any changes yourself. The user will do this`
- **THEN** the intended rule classification is PASS because the invocation does not create a commit, and assessment gates remain evaluated with enforcement determined by mode and rule setting

#### Scenario: README edit is not a commit
- **WHEN** an edit appends `hello world` to README.md under the original no-commit rule
- **THEN** the intended no-commit classification is PASS rather than treating persistence of a file edit as a Git commit

#### Scenario: Combined edit and commit
- **WHEN** a shell sequence edits a file and then creates a Git commit under an unconditional BLOCK no-commit rule
- **THEN** the intended classification is FAIL; enforcement blocks the whole invocation without confirmation, while observation permits it and reports would-block

#### Scenario: Other restrictions remain independent
- **WHEN** an edit modifies the active policy without creating a Git commit
- **THEN** passing the no-commit rule does not override the policy-integrity finding; enforcement blocks and observation reports without vetoing

### Requirement: Exact assessment blocking diagnostics
For each valid assessment with triggered gates, TENET SHALL expose all triggered gates per affected rule in structured diagnostics and bounded owner-visible explanations, including when execution is permitted in observe mode or because the rule is WARN. Gates SHALL distinguish selected FAIL, selected UNKNOWN, selected-outcome probability below threshold, selected INSUFFICIENT evidence, and sufficient-evidence probability below threshold. Diagnostics SHALL include rule identity or location, rule enforcement setting, selected labels, relevant probabilities and effective thresholds. Existing aggregate decision and reason information SHALL remain available as counterfactual enforcement information, separately from actual permission and mode. Defaults SHALL remain 0.90 for both thresholds; diagnostic generation SHALL NOT change assessment gates.

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
