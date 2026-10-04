# Spec delta

## ADDED Requirements

### Requirement: Additive source-aware rule assessment
TENET SHALL apply every declaration from the global and selected project policies independently, in global-then-project source order and physical line order. Permissions, exceptions, severities, and thresholds in one declaration SHALL NOT alter another. Existing aggregation, confidence gates, advisory handling, and invocation-local approval SHALL apply across the complete set.

#### Scenario: Project permission conflicts with global prohibition
- **WHEN** a project rule permits an action and a global BLOCK rule prohibits it
- **THEN** each rule receives its own assessment and the global prohibition can block execution in enforce mode

#### Scenario: Project threshold cannot lower global threshold
- **WHEN** a project declaration has a lower evidence threshold than a global declaration
- **THEN** each declaration uses its own effective threshold and integrity retains the global configured threshold

#### Scenario: Project advisory cannot weaken global blocking rule
- **WHEN** project and global declarations contain identical text with different severities
- **THEN** both declarations remain active with their own severity

### Requirement: Bounded complete policy composition
TENET SHALL validate each present source using the existing UTF-8 and declaration grammar. The complete selected set SHALL contain at most 64 KiB of file bytes and 16 user declarations, with at most 4096 UTF-8 bytes per rule text. An empty, invalid, or over-limit present source or combined set SHALL make assessment unavailable. TENET SHALL NOT truncate, deduplicate declarations, or evaluate only the valid subset.

#### Scenario: Combined count exceeds the limit
- **WHEN** individually valid sources contain 9 global and 8 project declarations
- **THEN** the complete set is unavailable with a rule-count-limit failure

#### Scenario: Combined count at the limit
- **WHEN** valid sources contain exactly 16 declarations in total and meet all byte limits
- **THEN** the set is accepted with all 16 declarations

#### Scenario: Combined bytes exceed the limit
- **WHEN** each source meets the individual file limit but their byte total exceeds 64 KiB
- **THEN** the set is unavailable with a file-limit failure

#### Scenario: Empty present source
- **WHEN** either present source has no valid rule declarations
- **THEN** assessment is unavailable even if the other source is valid

#### Scenario: Same target selected in both roles
- **WHEN** global and project paths resolve to the same valid file
- **THEN** both role occurrences retain distinct declarations and count toward combined limits without ambiguous rule identities

### Requirement: Source-qualified rule provenance
Each current rule SHALL have an unambiguous identity and recorded origin that distinguish source role, source digest, and physical line, including identical source contents in both roles. Status, doctor, findings, and archives SHALL identify participating sources, validation failures, and the combined snapshot. Historical views SHALL use recorded policy contracts and provenance, never current files or inferred global/project roles.

#### Scenario: Identical files and line numbers
- **WHEN** global and project files contain identical bytes
- **THEN** their declarations have distinct identities and findings identify the correct role and source line

#### Scenario: Historical single-source record
- **WHEN** an older archive lacks global/project origin fields
- **THEN** it retains its recorded single-source meaning without guessing a role or rewriting the archive

#### Scenario: Current policy has changed
- **WHEN** a combined-policy archive is viewed after either source changes
- **THEN** the view uses recorded source digests, identities, and effective thresholds

#### Scenario: Owner checks policy readiness
- **WHEN** status or doctor describes a global-only, project-only, combined, or invalid policy set
- **THEN** it identifies source roles, source validation, and total rule count without requiring disclosure of policy text in diagnostics

### Requirement: Multi-source integrity and freshness
Built-in integrity SHALL protect every selected policy source and resolved target, including aliases, links, and parent-directory operations. It SHALL also prohibit creation or redirection of an absent selected candidate during an eligible session. User rules SHALL NOT override integrity or grant its approval. Freshness checks SHALL cover source bytes, resolved targets, and absent candidates before permission release; changes SHALL invalidate the entire snapshot.

#### Scenario: Mutation of either policy
- **WHEN** an intercepted action attempts to modify or delete either global or project policy, even while passing user rules
- **THEN** built-in integrity independently prohibits the action without an approval exception

#### Scenario: Same-byte link retargeting
- **WHEN** either source link is redirected to a different target with identical bytes
- **THEN** the snapshot is stale rather than considered current

#### Scenario: Candidate creation by the agent
- **WHEN** an eligible global-only session attempts to create its absent project candidate, or a project-only session attempts to create its absent global candidate
- **THEN** built-in integrity prohibits changing that selected policy candidate

#### Scenario: Change while approval is pending
- **WHEN** either source or candidate presence changes before an enforce-mode pending call receives permission
- **THEN** the old assessment or approval cannot authorize execution under the stale snapshot
