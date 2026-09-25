# Spec Delta

## Purpose

Let a BB owner inspect which TENET policy rules were flagged in a Pi thread without interrupting the agent or mistaking missing assessment data for a passing result.

## ADDED Requirements

### Requirement: Pi-only, display-only availability
The BB plugin SHALL offer a read-only rule-status action for Pi threads and SHALL NOT assess calls, load or enable TENET, change its mode, edit a policy, approve a call, or affect agent execution. It SHALL NOT offer rule status as though it applies to non-Pi provider threads.

#### Scenario: Pi thread with no active TENET assessment
- **WHEN** the owner opens rule status for a Pi thread without linked TENET records
- **THEN** the plugin reports that coverage cannot be established from recordings, without claiming that no rules were broken or activating TENET

#### Scenario: Non-Pi thread
- **WHEN** the owner views a Codex or other non-Pi thread
- **THEN** this plugin shows no TENET thread action or finding indicator

### Requirement: Quiet finding indicator and on-demand details
The plugin SHALL show no per-call notification, popup, agent-visible message, or ordinary passing-call indicator. It SHALL make the status action available even without findings and show a compact thread indicator only when a linked, validated TENET assessment selects FAIL for at least one rule. The on-demand view SHALL identify each flagged rule, its BLOCK/WARN or built-in status, recorded rule text or reference, associated call, and recorded assessment state. It SHALL distinguish a finding from TENET's counterfactual decision, actual permission, and observed execution.

#### Scenario: Validated FAIL in observe mode
- **WHEN** TENET records a valid FAIL for a rule in observe mode, and the call is released
- **THEN** the owner sees a finding indicator and can inspect the flagged rule and call without the plugin claiming the call was blocked or executed

#### Scenario: Clean assessments
- **WHEN** linked records contain only validated assessments with no selected FAIL
- **THEN** no finding indicator appears, while the action remains available and the view says only that no rule failures were recorded in the available assessments

#### Scenario: Multiple rules and calls
- **WHEN** separate assessed calls flag the same rule and another rule
- **THEN** the view identifies both rules and the calls that produced each finding without treating repeated findings as different policy declarations

### Requirement: Honest classification and incomplete coverage
The plugin SHALL classify a broken-rule finding only from a validated selected FAIL for a recorded rule, including WARN and built-in integrity; a counterfactual BLOCK on its own SHALL NOT count as a broken rule. Approval requirements, UNKNOWN, insufficient evidence, low confidence, operational unavailability, missing stages, capture loss and unreadable or unlinked archives SHALL remain distinguishable from confirmed passing coverage. A low-confidence selected FAIL SHALL be marked uncertain rather than shown as a confident finding.

#### Scenario: Approval is not a broken rule
- **WHEN** a rule selects APPROVAL_REQUIRED without a selected FAIL
- **THEN** the view shows approval required separately and does not show a broken-rule indicator

#### Scenario: Would block without FAIL
- **WHEN** a call would BLOCK solely because of UNKNOWN, insufficient evidence, low confidence or policy unavailability
- **THEN** the plugin shows incomplete or uncertain coverage, not a broken-rule indicator

#### Scenario: Partial history
- **WHEN** the archive is unreadable, indexing is incomplete, capture reports lost records, or a linked call lacks a valid assessment
- **THEN** the view exposes the applicable limitation and never labels the whole thread as fully compliant

### Requirement: Exact thread association and archive compatibility
The plugin SHALL associate new Pi recordings with the BB thread identity supplied to that Pi process and the thread's machine; it SHALL read only records linked to the selected Pi thread on its host. Resumes of the same BB thread SHALL accumulate findings, while different BB threads, hosts and Pi sessions SHALL remain separate. Records without a trustworthy BB thread association SHALL remain browsable in TENET's existing inspector but SHALL NOT be inferred into a BB thread by path, title, native session ID alone or time. Existing archives SHALL remain readable without migration.

#### Scenario: Resume and fork
- **WHEN** a Pi session resumes in the same BB thread and a fork runs in another BB thread
- **THEN** each BB thread shows only its linked findings, with the resumed thread retaining its prior findings

#### Scenario: Historic record without link
- **WHEN** a valid older recording has no BB thread identity
- **THEN** the plugin does not attribute it to a thread, and TENET's standalone inspector still reads it

#### Scenario: Same native session ID on two machines
- **WHEN** recordings on separate hosts reuse a Pi session ID or BB-looking identifier
- **THEN** one host's records cannot appear in the other's thread status

### Requirement: Owner-only bounded archive access
The BB plugin SHALL return bounded rule summaries and on-demand details through owner-facing BB UI only. It SHALL not send findings or raw recorded evidence to agent messages, tool results, evaluator input, or public endpoints. It SHALL validate archive records and treat stored rule text and metadata as untrusted display data. Archive read or plugin failures SHALL not affect TENET assessment, permissions, execution, or the independent inspector.

#### Scenario: Sensitive captured evidence
- **WHEN** a recording contains a secret embedded in submitted action text
- **THEN** the thread indicator and summary do not copy that text, and the plugin renders any displayed rule text as inert text

#### Scenario: Archive read fails
- **WHEN** the Pi thread's machine or archive is unavailable
- **THEN** the status action reports coverage unavailable without showing stale data as current or changing the running thread
