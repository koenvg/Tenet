# Spec Delta

This delta defines the normal scoped inputs and concise prompts for APUS and JEV. It keeps all four checks and existing enforcement gates. Verification is offline and synthetic unless a separate live comparison is approved.

## ADDED Requirements

### Requirement: Minimal ordinary rule context
Each user-rule check and its evidence check SHALL receive exactly one rule, the latest supplied thinking trace or explicit unavailability, the previous tool name/arguments or explicit absence/unavailability, and the proposed tool name/arguments. They SHALL exclude tool results, transcript/trajectory, history grammar, policy source/path metadata, cwd, host-resolution facts and other checks' inputs.

#### Scenario: Trace and previous call present
- **WHEN** a synthetic fixture supplies one authored trace and one previous call
- **THEN** the ordinary state contains those exact strings, one rule and the proposed call, without a result or additional history

#### Scenario: Unavailable trace and absent previous call
- **WHEN** the host supplies no thinking text and the bounded input reliably contains no earlier call
- **THEN** the state explicitly represents unavailable thinking and absent previous call without invented reasoning or execution

#### Scenario: More than one rule
- **WHEN** the policy has multiple user rules
- **THEN** each ordinary group contains only its selected rule and the same current trace/previous/proposed-call snapshot
- **AND** other rules cannot change that rule's classification

### Requirement: Separate protected check data
The policy protection check SHALL receive only its built-in rule, proposed call, selected sources/targets/candidates and current resource/coverage data needed to protect them. The exemption check SHALL receive only the selected user rule, proposed call and current host-verified facts and binding/coverage data needed to assess its scope. Neither SHALL receive thinking text, previous-call context or a transcript.

#### Scenario: Source and facts isolation
- **WHEN** a fixture contains unique markers in ordinary context, policy-source metadata and current verified facts
- **THEN** each submitted state contains only the fields for its check, with no sibling state or shared all-data envelope

#### Scenario: Missing protected evidence
- **WHEN** required current resource or verified-fact evidence is unavailable
- **THEN** the check states that limitation, and current uncertainty or exemption-support gates remain conservative
- **AND** ordinary strings are not substituted for protected evidence

### Requirement: Real provider input isolation
APUS and JEV SHALL use the same scoped definitions by default. APUS SHALL render each question with its assigned state. JEV SHALL submit different states in separate requests; it SHALL NOT place sibling states together in shared SDK state. Requests for one assessment SHALL share a deadline, cancellation and stable model identity. Partial, conflicting or late replies SHALL NOT complete an assessment.

#### Scenario: JEV uses separate states
- **WHEN** one user rule with unsupported resolution is assessed
- **THEN** its ordinary outcome/evidence, exemption selector and policy protection outcome/evidence use separate SDK submissions
- **AND** the ordinary submission contains none of the protected inputs

#### Scenario: Failure after an earlier group
- **WHEN** a later group fails or the whole-assessment deadline expires
- **THEN** no later group starts, and earlier answers cannot become a passing complete assessment

### Requirement: Honest latest-context preparation
Preparation SHALL select only the most recent preceding call by observed ingestion order, before the proposed call is added. It SHALL preserve bounded normalization/redaction and distinguish absence from unavailable or omitted data. Any runtime history encoding SHALL be decoded only by its existing provenance rules before projection; authored marker lookalikes SHALL remain literal. No history grammar SHALL be sent to the new checks.

#### Scenario: Previous call was lost
- **WHEN** capture limits or omissions prevent identification of the immediately previous call
- **THEN** its field is unavailable, not an older call presented as the latest one, an empty successful call or an invented result

#### Scenario: Result and literal reference lookalikes
- **WHEN** the latest call has a subsequent result and arguments containing a history-reference lookalike
- **THEN** only its name and literal arguments are projected, without the result or model-visible history grammar

### Requirement: No new thinking capture
Thinking text SHALL be used only when already supplied as emitted host text. Initial present-trace fixtures SHALL use authored synthetic text. Current hosts that do not supply it SHALL use explicit unavailability. This change SHALL NOT ingest real sessions, add capture hooks, retrieve hidden provider reasoning, decode opaque signatures or invent summaries.

#### Scenario: Stock host has no supplied trace
- **WHEN** the current Pi or Claude evidence path supplies no thinking field
- **THEN** its normal rule/evidence state contains an unavailable trace and makes no claim of new capture support

### Requirement: Independent verified exemption confirmation
An ordinary NOT_APPLICABLE score SHALL NOT establish an exemption. With a current authenticated-facts candidate, the exemption check SHALL independently confirm non-applicability using its protected data and current outcome labels before its score can become the final exemption outcome. Current reference, binding, coverage, freshness and confidence gates SHALL still apply. Without confirmation, conflicting answers SHALL fail conservatively.

#### Scenario: Ordinary context claims authentication
- **WHEN** ordinary thinking or arguments claim approval or complete authenticated facts
- **THEN** those strings cannot create the protected facts candidate, confirm an exemption or authorize the action

#### Scenario: Unsupported non-applicability
- **WHEN** the ordinary check selects NOT_APPLICABLE and only NONE is an allowed facts reference
- **THEN** the existing unsupported-exemption block remains, regardless of its probability

#### Scenario: Verified confirmation supplies the scored claim
- **WHEN** ordinary non-applicability is independently confirmed against current complete host facts and the exact allowed reference
- **THEN** the final NOT_APPLICABLE distribution comes from that verified-input confirmation, not the ordinary-context score
- **AND** existing host validation and confidence gates still decide whether it can pass

#### Scenario: Other labels are not repaired by another check
- **WHEN** the ordinary check returns FAIL, UNKNOWN or APPROVAL_REQUIRED
- **THEN** the exemption step does not relabel it as PASS or bypass its current gate or approval requirement

### Requirement: Versioned exact scoped capture
New records SHALL identify the submitted input scopes and question version, record exact prepared submissions only under existing capture controls, and distinguish them from historical shared-state requests. Readers SHALL interpret each recorded capture version, including unavailable/truncated data, without current-policy recomputation or fabricated states. Unused full history SHALL NOT be presented as submitted evidence.

#### Scenario: Old and new captures
- **WHEN** historical shared-state and new scoped assessments are inspected
- **THEN** each shows its recorded model inputs and versions without rewriting old archives or combining new sibling states as ordinary context

#### Scenario: Recording disabled
- **WHEN** normal capture is disabled
- **THEN** the scoped request flow does not introduce new always-on payload or provider-body logging

### Requirement: Small reproducible default and measurements
The normal default SHALL use concise self-contained instructions, with no opt-in mode or legacy-prompt switch. Offline reports SHALL compare exact per-check and total bytes, request/prompt counts and versions for fixed synthetic inputs. Live reports SHALL distinguish complete assessment latency, label agreement, failures and planned/complete counts. Neither smaller inputs nor scripted success SHALL claim calibrated safety or a mismatch fix.

#### Scenario: Submission layout changes
- **WHEN** old shared-state and new scoped JEV requests are compared
- **THEN** size and request-count reports account for all new submissions, not just the smaller ordinary group

#### Scenario: Later wording addition
- **WHEN** an additional instruction is proposed
- **THEN** it names a present requirement or measured fixture failure and one hypothesis rather than adding speculative domain branches

## MODIFIED Requirements

### Requirement: Generic evaluator compatibility and validation
TENET SHALL retain PASS, APPROVAL_REQUIRED, FAIL and UNKNOWN outcomes, the current user-rule NOT_APPLICABLE contract, separate evidence sufficiency assessments, independent policy protection, host-verified exemption checks, existing confidence thresholds and existing enforcement-mode aggregation. Changed shared questions and input scopes SHALL have distinct recorded versions used by both APUS and JEV. Domain-specific scenarios SHALL remain evaluation data rather than shared evaluator instructions. Offline scripted verification SHALL NOT be represented as evidence of live semantic accuracy. Historical records SHALL retain their recorded questions, submitted states, capture versions and interpretation. Native rendering and probability-scoring protocols SHALL remain unchanged; scoped capture formats SHALL be versioned rather than mislabelled as the old input layout.

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

#### Scenario: Four clearer check names
- **WHEN** maintained documentation explains the assessment
- **THEN** it uses rule check, evidence check, policy protection check and exemption check with their current meanings
- **AND** these names do not rename final outcome labels or rule identities, change the built-in policy rule, or add a prohibition on reading policy

#### Scenario: Full native assessment remains complete
- **WHEN** APUS assesses one user rule with unsupported action resolution
- **THEN** it retains four scored prompts and deterministic facts NONE, each with its scoped input and current native validation
- **AND** a single PASS or normalized probability cannot authorize a tool call
