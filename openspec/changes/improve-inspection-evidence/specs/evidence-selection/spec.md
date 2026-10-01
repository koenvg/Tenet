# Evidence selection

## Purpose

Keep evaluator evidence bounded and useful across arbitrary tools and policies while preserving current action facts, historical provenance and explicit information loss.

## ADDED Requirements

### Requirement: Domain-neutral evidence preparation
TENET SHALL prepare evidence using structural equality, chronology, byte limits and recorded event relationships. Tool names, command vocabulary, rule-domain labels and purported safe-tool descriptions SHALL NOT select a shortcut, grant permission, authenticate effects or exclude a rule. Selection SHALL NOT execute actions, probe external state or make an additional model request to decide what history to retain. Unsupported action resolution SHALL remain unsupported after compaction.

#### Scenario: Different names for the same structure
- **WHEN** equivalent evidence is supplied with different tool names and unrelated rule-domain labels
- **THEN** selection applies the same structural and budgeting rules without adding an exemption or trusted fact

#### Scenario: Safe-looking command with missing executor facts
- **WHEN** an inspection-looking invocation has no authenticated resolution
- **THEN** evidence preparation preserves that limitation and does not manufacture complete coverage

### Requirement: Lossless repeated-content references
TENET SHALL compact exactly repeated, sufficiently large historical values only when the compact representation saves serialized bytes. Every reference SHALL resolve within the same immutable submitted snapshot to the exact sanitized value. Compaction SHALL retain each distinct event's origin, session, call identity, timestamp, order and redaction markers. Equal content SHALL NOT collapse distinct execution attempts or establish execution success, approval or current-state authority. Nonidentical values SHALL NOT be merged by fuzzy matching or tool-specific text rewriting.

#### Scenario: Same document in multiple events
- **WHEN** two recorded events contain the same large sanitized string
- **THEN** the submitted history stores its content once while retaining both event identities and resolvable references

#### Scenario: Similar output with presentation differences
- **WHEN** a result adds anchors, wrappers or changed text to an earlier document
- **THEN** TENET does not treat the values as identical unless equality is exact, and ordinary history bounds still apply

#### Scenario: Reference target would be removed
- **WHEN** budgeting removes an event or content fragment used by another retained event
- **THEN** retained references remain resolvable or become explicit omission markers, never dangling references

### Requirement: Bounded history without current-fact loss
TENET SHALL protect the pending action arguments, policy, integrity constraint, host context and current resolved facts ahead of optional history. The default optional-history allowance SHALL be at most one third of the total serialized evidence byte limit, including reference content and selection metadata. One event's retained content SHALL consume at most one quarter of that allowance, excluding shared content counted once against the whole allowance. Event-count, node-count, depth and UTF-8 byte limits SHALL remain bounded. Unused optional-history capacity SHALL NOT justify inflating a large event beyond its cap. If protected current evidence cannot fit, assessment SHALL remain unavailable or blocked rather than submitting truncated facts.

#### Scenario: Large recent document
- **WHEN** a large document and its echoed result precede a small pending action under default limits
- **THEN** their optional history stays within the history and per-event limits, leaving the pending action and current facts unchanged

#### Scenario: Current authenticated facts exceed capacity
- **WHEN** complete current facts cannot fit within the evidence limit
- **THEN** TENET does not truncate them into an apparently complete operation and reports the existing conservative capacity failure

#### Scenario: History disabled
- **WHEN** the configured history event limit is zero
- **THEN** no historical content or historical reference pool is submitted, while omission counts and current evidence remain explicit

### Requirement: Auditable selection and information loss
Each new submitted snapshot SHALL identify its evidence-selection version and record retained events, deduplicated content, shortened or dropped history, known prior omissions and effective byte limits. Exact compaction SHALL be distinguished from lossy shortening or removal. Historical excerpts SHALL retain explicit omission markers, their event relationship and original known size; their retained text SHALL NOT claim to be the whole observation. A missing result SHALL remain unknown rather than a successful or failed execution. Admission-time bounds and final request bounds SHALL share these rules so early eviction does not silently defeat compaction.

#### Scenario: Recent call and oversized result
- **WHEN** only excerpts or metadata from a call/result pair can fit
- **THEN** the pair's identities and the result's information loss remain visible without a fabricated complete result

#### Scenario: Snapshot isolation
- **WHEN** later sibling results arrive after an assessment snapshot is captured
- **THEN** they do not change its content pool, retained history or selection diagnostics

### Requirement: Redaction and historical contract preservation
TENET SHALL redact historical data before interning or hashing it for submitted content references. Reference identifiers SHALL NOT encode unredacted secret values. New evidence representations SHALL have recorded versions. Historical submitted requests SHALL remain inspectable exactly as recorded and SHALL NOT be rebuilt, compacted or reinterpreted using current rules.

#### Scenario: Repeated credential-bearing value
- **WHEN** repeated history contains fields subject to existing credential redaction
- **THEN** neither submitted values nor reference metadata expose those original field values

#### Scenario: Old invocation inspected after deployment
- **WHEN** the inspector opens an invocation recorded under an earlier evidence contract
- **THEN** it shows that recorded payload and marks missing selection metadata as unavailable rather than inventing current diagnostics
