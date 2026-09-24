# Spec Delta

## Purpose

Keep decisions from different agent hosts distinct and inspectable while preserving access to existing Pi recordings and their historical meaning.

## ADDED Requirements

### Requirement: Host-qualified archive identity

New recordings SHALL identify the host, native session, execution context and invocation without collisions between hosts or subagents. The inspector SHALL display host identity and relevant recorded coverage limitations. Assessment, would-decision, actual TENET permission, approval and observed execution SHALL remain separate. Missing results SHALL remain unknown and a passed assessment SHALL NOT certify host coverage.

#### Scenario: Same native identity across hosts
- **WHEN** Pi and Claude Code record matching native session and call IDs
- **THEN** the archive and inspector list distinct sessions/invocations and do not merge their evidence or outcomes

#### Scenario: Released without result
- **WHEN** a Claude hook returns without a veto but no result is observed
- **THEN** the inspector shows release separately from unknown execution

### Requirement: Historical archive compatibility

The new reader SHALL continue to read existing schema-1 Pi archives without rewriting them. Existing links and Pi session selection SHALL remain usable. New records SHALL use an explicitly supported version; unsupported or corrupt records SHALL remain visible as issues rather than being silently misclassified. Historical thresholds and decisions SHALL use recorded values.

#### Scenario: Mixed archive
- **WHEN** the archive contains legacy Pi records and new Pi and Claude Code records
- **THEN** the inspector displays all supported records with correct host attribution and retains legacy links

### Requirement: Cross-host recording privacy and isolation

Existing recording opt-out, dormant/off suppression, evidence bounds, redaction, owner-only filesystem access and best-effort failure behavior SHALL apply to both adapters. Capture failures SHALL NOT alter permission. The inspector SHALL remain read-only and SHALL NOT become a bridge control or approval endpoint. Minimal bridge control state SHALL NOT retain raw action payloads when capture is disabled and SHALL not be presented as diagnostic recording.

#### Scenario: Recording disabled
- **WHEN** a Claude session runs with capture disabled
- **THEN** policy assessment can proceed without writing new diagnostic evidence or retaining raw payloads in bridge control state

#### Scenario: Archive failure
- **WHEN** recording fails during an otherwise valid assessment
- **THEN** permission follows the assessment and mode rather than the recording failure, with capture loss reported where available
