# Assessment evidence budgeting

## Purpose

Retain useful current-invocation evidence within a bounded evaluator request, so optional history does not unnecessarily remove the description of the action being assessed.

## ADDED Requirements

### Requirement: Current-action context precedes optional history
Within the existing evidence byte budget, TENET SHALL preserve the complete current arguments, captured policy/context and material resolved facts before optional content. It SHALL retain current tool metadata ahead of older optional history when that current-only request fits. History selection SHALL respect the configured event limit and retain a chronological suffix, omitting oldest events first. A missing description or schema SHALL remain missing rather than being reconstructed from tool names, other tools or historical assertions. Tool metadata SHALL remain ordinary evidence, not authenticated complete effect coverage.

#### Scenario: History pressure with useful current metadata
- **WHEN** the complete current-only request fits but adding recent observations exceeds the byte budget
- **THEN** TENET retains the current description and schema and removes oldest observations until the request fits
- **AND** current arguments and resolved facts remain unchanged

#### Scenario: Current metadata originally absent
- **WHEN** the host did not supply a tool description or schema
- **THEN** TENET retains the corresponding unavailable markers and does not invent metadata to avoid uncertainty

#### Scenario: Description claims authenticated safety
- **WHEN** a tool description claims complete harmless effects but no authenticated resolver supplied those facts
- **THEN** retaining the description does not authenticate that claim or enable a NOT_APPLICABLE exemption

### Requirement: Bounded optional-metadata fallback
If the current-only request exceeds the budget, TENET SHALL remove optional schema before removing the current description. It SHALL only remove the description if the current-only request still cannot fit after schema removal. After choosing the retained metadata, TENET SHALL select history again from the original eligible observations rather than permanently discarding history during unsuccessful fitting attempts. It SHALL remove optional metadata rather than reject a request whose required current evidence can fit. If required current evidence cannot fit, assessment SHALL remain unavailable under existing mode-specific consequences, with no invented successful assessment. Retained fields SHALL be exact copies rather than silently truncated text.

#### Scenario: Oversized schema with useful description
- **WHEN** the current-only request does not fit because of an oversized schema but fits without that schema
- **THEN** TENET retains the description, omits the schema, and keeps the newest history suffix that fits

#### Scenario: Description itself cannot fit
- **WHEN** required current evidence fits but the description still prevents fitting after schema removal
- **THEN** TENET omits the description, explicitly records metadata omission, and keeps the newest history suffix that fits the reduced request

#### Scenario: Fallback does not lose recoverable history
- **WHEN** a failed attempt with oversized metadata excluded history and a reduced-metadata request can fit some of the original eligible observations
- **THEN** those observations are considered again, without duplicating omission counts from the failed attempt

#### Scenario: Required current evidence is too large
- **WHEN** current arguments or material resolved facts exceed the budget even with all optional metadata and history removed
- **THEN** no evaluator request is submitted and the assessment is unavailable rather than truncated into apparent complete coverage

### Requirement: Deterministic snapshots and explicit omissions
The submitted request SHALL remain within the configured byte and event limits, including omission markers. TENET SHALL preserve existing source omission counts and add only newly omitted observations from the final selected request. Metadata omission and unavailable material history SHALL remain explicit in the recorded submitted state. Repeated preparation of identical inputs SHALL produce identical retained content and counts without mutating the source. Later results SHALL NOT change an already captured observation or enforcement request. Historical submitted payloads SHALL not be repacked or rewritten.

#### Scenario: Exact byte boundary
- **WHEN** a prepared request including omission markers is exactly the configured byte limit
- **THEN** it is accepted without another eviction

#### Scenario: Source already omitted observations
- **WHEN** source history reports earlier omissions and preparation removes additional eligible observations
- **THEN** the final count is the source count plus only the additional observations omitted by the final selection

#### Scenario: Repeated preparation and concurrent results
- **WHEN** the same immutable input is prepared twice and the host records later tool results
- **THEN** both submitted snapshots retain identical pre-execution content and omission counts
- **AND** no input object or historical archive record changes
