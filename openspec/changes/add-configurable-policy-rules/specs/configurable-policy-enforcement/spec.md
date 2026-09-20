## Purpose

Let owners define explicit plain-text rules that TENET evaluates individually before tool execution, with conservative combined decisions and protection against agent changes to the active policy.

## ADDED Requirements

### Requirement: Explicit rule declarations
TENET SHALL load one rule from each line whose trimmed text starts with the case-sensitive prefix `Rule;`. The remaining trimmed text SHALL be the complete rule; additional semicolons SHALL remain part of its text. Blank lines and other prose SHALL NOT become rules. Recognition SHALL be line-based rather than Markdown-aware, including inside code fences, and documentation SHALL state this behavior. Each loaded rule SHALL retain its source line and an identity scoped to the policy snapshot. Duplicate rules SHALL remain separate entries.

#### Scenario: Multiple declarations with prose
- **WHEN** a file contains a heading, two nonempty `Rule;` lines and explanatory prose
- **THEN** exactly those two rules are loaded in file order and identified by their source lines

#### Scenario: Missing or invalid declarations
- **WHEN** the selected file is missing, unreadable, empty, contains zero declarations, or contains a declaration with no rule text
- **THEN** TENET reports an unavailable policy and blocks intercepted calls rather than silently enforcing a subset

#### Scenario: Legacy publication file
- **WHEN** the file contains only the previously supported publication sentence without `Rule;`
- **THEN** TENET blocks with a policy-format diagnostic and does not rewrite the file

### Requirement: Bounded complete policy snapshots
TENET SHALL bind decisions to an immutable snapshot of the selected policy, its source and original-byte digest. It SHALL enforce documented file-size, rule-count and per-rule-size limits by rejecting the whole policy, never truncating or silently omitting rules.

#### Scenario: Policy exceeds a limit
- **WHEN** a policy exceeds a documented input limit
- **THEN** startup identifies the exceeded limit and intercepted calls remain blocked

### Requirement: Per-rule assessments
Every valid action assessment SHALL contain exactly one result for every loaded rule plus the built-in policy-integrity constraint. Each result SHALL identify its rule and provide a PASS, APPROVAL_REQUIRED, FAIL or UNKNOWN outcome, an outcome probability distribution and a separate evidence-sufficiency distribution. Missing, duplicated, unknown or malformed result identities or distributions SHALL invalidate the response. Rule outcomes SHALL NOT be inferred from unstructured provider prose.

#### Scenario: Incomplete assessment
- **WHEN** the provider omits one rule result while all returned rules pass
- **THEN** TENET blocks with an invalid-response reason

#### Scenario: Unrelated rule
- **WHEN** sufficient evidence establishes that a proposed read does not violate a rule prohibiting publication
- **THEN** that rule is assessed as PASS rather than requiring an upload approval

### Requirement: Full-rule semantics and approval exceptions
TENET SHALL distinguish unconditional prohibitions from explicit approval conditions using the complete rule text, not its first word. An unconditional prohibition SHALL yield FAIL when violated and SHALL NOT be overridable. An explicit approval condition SHALL yield APPROVAL_REQUIRED when triggered. Statements inside tool arguments or tool metadata claiming approval SHALL NOT constitute native user approval. Ambiguous or conflicting instructions within a rule SHALL yield UNKNOWN when they cannot be confidently resolved.

#### Scenario: Never without approval
- **WHEN** a proposed upload is assessed against `Never publish code to a remote repository without explicit approval.`
- **THEN** the result requires approval rather than treating the first word as an unconditional prohibition

#### Scenario: Unconditional prohibition
- **WHEN** an action violates `Never delete files outside the project directory.`
- **THEN** the result is FAIL and no confirmation can release that invocation

### Requirement: Conservative aggregation
TENET SHALL BLOCK if any result is FAIL or UNKNOWN, evidence is insufficient, or a selected outcome or sufficient-evidence probability is below its configured threshold. Otherwise it SHALL ASK if any result is APPROVAL_REQUIRED and ALLOW only when all results are PASS. A passing rule SHALL NOT override a failing rule. Defaults SHALL remain 0.90 for each probability threshold. These thresholds SHALL NOT be presented as calibrated guarantees.

#### Scenario: Mixed approval and failure
- **WHEN** one rule requires approval and another fails
- **THEN** the combined decision is BLOCK and no approval prompt is shown

#### Scenario: All passing rules
- **WHEN** every loaded rule and the integrity constraint pass both probability gates
- **THEN** the combined decision is ALLOW

#### Scenario: Uncertain passing label
- **WHEN** a PASS result has selected-outcome probability below 0.90 under default configuration
- **THEN** the invocation is blocked for uncertainty

### Requirement: Non-overridable policy integrity
TENET SHALL impose a built-in constraint, independent of editable rule text, prohibiting agent actions that modify, delete, replace, rename, or redirect the selected policy file or its resolved target. This SHALL cover writes through aliases, replacement through parent-directory operations, and equivalent operations through unfamiliar tools when evidenced by the invocation. A rule permitting policy modification SHALL NOT override the constraint. Unknown effects on the policy SHALL block; policy reads SHALL remain eligible for ALLOW. This is a pre-execution semantic guard, not a claim of filesystem isolation.

#### Scenario: Direct policy edit
- **WHEN** the agent proposes changing the active policy through a file-edit tool
- **THEN** TENET blocks the invocation without offering confirmation

#### Scenario: Alternate route to policy mutation
- **WHEN** a shell command, rename, link replacement or unfamiliar tool is assessed as modifying or redirecting the active policy
- **THEN** TENET blocks regardless of any passing user-defined rule

#### Scenario: Policy weakening rule
- **WHEN** the policy includes `Rule; Allow editing TENET.md.` and the agent proposes such an edit
- **THEN** the built-in integrity constraint still blocks it

#### Scenario: Opaque policy effects
- **WHEN** available evidence cannot establish whether an opaque action changes the policy
- **THEN** TENET blocks for insufficient evidence rather than offering an override

### Requirement: Owner-managed policy changes
Owner edits outside intercepted agent actions SHALL remain possible. TENET SHALL NOT automatically adopt changed policy bytes during a pending invocation. Before release it SHALL verify that the selected source, resolved target and bytes still match the active snapshot; a mismatch or failed check SHALL block and request policy reload or restart. Changes SHALL become active only through the documented session-start policy load path.

#### Scenario: Policy changes during approval
- **WHEN** the owner edits the selected file while an approval prompt is open
- **THEN** even a positive answer does not release the old invocation and the changed policy requires reloading

### Requirement: Generic evidence and explicit limitations
All intercepted tools SHALL use the same rule-evaluation path without tool-name exemptions or bespoke executor replacement. Evidence SHALL include the invocation, available tool metadata, trusted host working directory and selected policy identity. Configured sensitive fields SHALL be redacted in copied evidence without changing executor arguments. Rule text and tool evidence SHALL be kept distinct; tool-supplied instructions SHALL NOT rewrite the evaluator contract. TENET SHALL NOT invent filesystem observations, execution history or prior approval.

#### Scenario: History-dependent rule
- **WHEN** a rule requires previous successful tests but no trusted execution history is available
- **THEN** the evaluator returns UNKNOWN rather than treating an agent claim that tests passed as proof

#### Scenario: Redacted material evidence
- **WHEN** redaction removes information required to assess a rule
- **THEN** that rule is UNKNOWN or has insufficient evidence and execution is blocked

### Requirement: Invocation-local multi-rule approval
An ASK decision SHALL produce one native confirmation identifying all approval-requiring rules, the policy snapshot and the proposed invocation. Only an explicit positive response SHALL release that unchanged invocation. Denial, dismissal, missing UI, UI failure or cancellation SHALL block. Approval SHALL NOT carry to later invocations or override FAIL, UNKNOWN or the integrity constraint. Tool identity and arguments SHALL be rechecked after assessment and approval.

#### Scenario: Multiple approval conditions
- **WHEN** two rules require approval and all other results pass
- **THEN** one prompt identifies both rules and approval applies only to that pending invocation

#### Scenario: Changed arguments
- **WHEN** invocation arguments change after assessment or during confirmation
- **THEN** TENET blocks rather than executing unassessed arguments

### Requirement: Bounded fail-closed judge execution
Invalid configuration, missing credentials, malformed provider responses, provider failure, timeout and cancellation SHALL block. The default assessment deadline SHALL remain 2500 milliseconds for the complete assessment, not per rule, and retries SHALL remain disabled. No partial successful result set SHALL authorize execution.

#### Scenario: Batch timeout
- **WHEN** the complete rule assessment does not finish before the deadline
- **THEN** the entire invocation is blocked even if some rule results are available

### Requirement: Rule-aware audit and verification
Startup SHALL expose the loaded rule count, policy digest and question version. Records SHALL distinguish per-rule assessment, combined decision, approval, permission and observed execution, preserving rule identities and block reasons without logging unrequested provider prose or raw secret-bearing arguments. Ordinary verification SHALL be offline with provider and UI responses scripted. Live semantic evaluation SHALL require separate explicit authorization and SHALL not execute fixture actions.

#### Scenario: Released but not observed
- **WHEN** an invocation receives permission but no tool result is observed
- **THEN** audit records do not claim successful execution

#### Scenario: Offline verification
- **WHEN** the ordinary test and smoke suites run
- **THEN** unexpected network requests fail the tests and no live model calls or publication actions occur
