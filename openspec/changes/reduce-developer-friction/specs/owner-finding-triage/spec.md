# Owner finding triage

## Purpose

Help developers distinguish suspected policy violations from uncertain assessments, operational failures and incomplete observation without reading every recorded tool call.

## ADDED Requirements

### Requirement: Distinct finding categories
Owner reports and the inspector SHALL separately identify suspected violations, confidence or material-evidence uncertainty, approval requirements, evaluator unavailability and pending/dropped/cancelled observation. Categories SHALL be derived from recorded labels, gates and lifecycle facts, not current policy or invented provider rationale. A call with several categories SHALL retain them all. Category counts SHALL state whether they count distinct calls or findings and SHALL NOT imply disjoint totals when categories overlap. Actual permission, counterfactual decision, mode and observed execution SHALL remain separate.

#### Scenario: PASS below evidence threshold
- **WHEN** every rule selects PASS but a sufficient-evidence probability misses its threshold
- **THEN** the owner sees uncertainty and its exact gate, not a claim that the developer violated the rule

#### Scenario: Approval mixed with uncertainty
- **WHEN** publication selects APPROVAL_REQUIRED but another gate blocks the invocation
- **THEN** the approval condition and uncertainty are both visible without suggesting that approval alone clears every blocker

#### Scenario: Provider distribution rejected
- **WHEN** validation rejects a malformed or incompatible probability distribution
- **THEN** the owner sees evaluator unavailability with a bounded validation reason rather than a developer violation

### Requirement: Grouping without lost evidence
The inspector SHALL support category filtering and bounded grouping of repeated uncertainty by captured policy identity, rule identity, assessment profile and gate or missing-fact reason. Groups SHALL show count, first/last occurrence and expandable invocation references. Grouping SHALL NOT suppress the underlying records, hide changed policy/profile identities, or change decisions. The owner UI SHALL retain explicit eviction and coverage-loss counts. Observation findings SHALL stay out of agent messages, tool results and later evaluator evidence.

#### Scenario: Repeated harmless reads
- **WHEN** many reads trigger the same evidence-confidence gate under one policy and profile
- **THEN** the owner can review a counted group and expand individual calls rather than mistaking each occurrence for a different violation

#### Scenario: Policy changes
- **WHEN** a similarly named rule is loaded from a different policy digest
- **THEN** its findings are not silently merged with historical findings from the previous policy

### Requirement: Compatible and honest reader status
The inspector SHALL expose the running reader build identity and supported recording schemas. It SHALL distinguish unsupported schema records, corrupt records, incomplete indexing and no matching recordings. Unsupported newer data SHALL produce a prominent compatibility notice even when older sessions can be shown. It SHALL NOT present an incomplete supported subset as the complete latest archive. Reader launch guidance SHALL explain when both rebuilding and restarting are necessary. Updating a reader SHALL preserve historical deep links and SHALL not rewrite the archive or expose it beyond the owner's existing access configuration.

#### Scenario: Old records readable but newer records unsupported
- **WHEN** a reader encounters a newer unsupported schema alongside supported historical records
- **THEN** it shows the supported records with a visible partial-coverage warning and upgrade guidance rather than an apparent current all-clear

#### Scenario: Mixed supported schema versions
- **WHEN** schema-1, schema-2 and new observation-lifecycle records coexist
- **THEN** each invocation retains its recorded thresholds, profile, identity and historical permission semantics

### Requirement: Privacy-preserving regression handoff
A reviewed false-positive case SHALL be representable as an explicitly authored sanitized replay fixture with an expected outcome, evidence limitations and a non-secret source reference. Fixture creation SHALL not upload raw recordings, execute recorded actions, automatically weaken policy, or feed an owner's label back as permission. Live replay SHALL require separate explicit evidence-disclosure authorization.

#### Scenario: Review label without policy change
- **WHEN** an owner identifies an edit as a false positive against a Git-commit rule
- **THEN** its sanitized fixture can record that expected distinction without granting the original or any future invocation permission
