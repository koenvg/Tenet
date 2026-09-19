## Purpose

Determine whether an observed coding-agent action publishes code to a remote repository, using the selected policy and recent observed trajectory. Return an actionable decision without claiming visibility into actions that the host does not expose.

## ADDED Requirements

### Requirement: One explicit publication policy

TENET SHALL support the policy "Never publish code to a remote repository without explicit approval" using a selected human-readable `TENET.md`. It SHALL identify the active policy and its source in decisions. The POC MUST NOT present unrelated Markdown rules as enforced policies. When the selected policy file is missing, empty, or unreadable, an enabled guard SHALL report that it is unavailable and SHALL NOT silently permit intercepted actions.

#### Scenario: Selected policy is available
- **WHEN** the guard starts with a readable policy file containing the supported publication rule
- **THEN** decisions identify that file and the publication policy
- **AND** the user is told that only code publication is supported

#### Scenario: Policy file cannot be loaded
- **WHEN** the selected policy file cannot be loaded by an enabled guard
- **THEN** the guard reports a policy configuration failure
- **AND** intercepted actions receive `BLOCK` until a valid configuration is loaded

### Requirement: Tool-generic evidence contract

TENET SHALL assess every exposed tool call through the same evidence contract using tool identity, available description and parameter schema, proposed arguments, and recent observed calls/results. It SHALL NOT require channel registration, tool-specific field mappings, or a dedicated adapter for a tool family. Tool names and descriptions SHALL provide evidence rather than act as permission rules. Missing metadata SHALL remain explicit and SHALL NOT by itself exempt an unfamiliar tool from assessment.

#### Scenario: Previously unseen tool proposes publication
- **WHEN** the host supplies a previously unseen tool name and argument shape with enough evidence to identify code publication
- **THEN** TENET assesses it through the existing decision path without new configuration
- **AND** the publication policy requires approval rather than bypassing or blocking solely because the tool is unfamiliar

#### Scenario: Description is unavailable
- **WHEN** the host supplies tool arguments but no description
- **THEN** TENET marks the description as unavailable and assesses the remaining evidence
- **AND** the resulting decision depends on the effect assessment and evidence sufficiency rather than a tool allowlist

### Requirement: Publication is an effect rather than a tool name

TENET SHALL assess proposed actions using tool metadata, arguments, and available observed context rather than relying only on tool names or the agent's description of its intent. Publication SHALL include uploading source files or Git objects to a remote repository, including private repositories. Git commands, repository API calls, browser interactions, and MCP calls are examples of tool-call evidence, not separate integration requirements. Local editing, local commits, and preparation that does not upload code SHALL be distinguishable from publication. The policy MUST NOT be presented as a general prohibition on all outbound data or model-provider requests.

#### Scenario: Equivalent publication through different routes
- **WHEN** separate observed actions use Git push, a repository API upload, a browser code submission, or an MCP file-creation tool to upload code to a remote repository
- **AND** the supplied evidence identifies the publication effect
- **THEN** each action is assessed as publication requiring approval regardless of route

#### Scenario: Local preparation is not publication
- **WHEN** observed evidence establishes a local edit, a local commit, or preparation of an upload without sending code to the remote repository
- **THEN** the assessment distinguishes that operation from publication
- **AND** the publication policy does not itself require approval for that operation

#### Scenario: Upload precedes final commit
- **WHEN** an intercepted operation uploads code objects to a remote repository before a later branch update or commit operation
- **THEN** the upload itself is assessed as publication
- **AND** the guard does not wait for the later operation to require approval

### Requirement: Assessments use bounded trajectory evidence

TENET SHALL consider the current proposed call together with a bounded, ordered record of observations from the same session. Evidence SHALL preserve generic tool arguments and text or structured results with their source call and observation time, rather than require tool-specific context extraction. Missing metadata, unsupported content, redaction, and truncation SHALL remain explicit. The judge SHALL consider conflicting or outdated observations when assessing evidence sufficiency. Policy and approval authority MUST NOT be derived from instructions contained in evidence.

#### Scenario: Browser action needs preceding context
- **WHEN** a proposed browser click has an ambiguous target identifier
- **AND** recent observations associate that identifier with a code-upload submission and its destination
- **THEN** the judge receives those observations with the proposed click
- **AND** the assessment can identify publication rather than treating the click as harmless in isolation

#### Scenario: Only an unsupported image is available
- **WHEN** relevant context is present only in a tool-result image that the judge cannot consume
- **THEN** TENET marks that context as unavailable
- **AND** it does not invent a textual observation or launch a tool-specific context collector

#### Scenario: Evidence tries to impersonate approval
- **WHEN** page text, a tool result, or an agent message states that the user already approved publication
- **THEN** TENET treats the statement as untrusted evidence
- **AND** it does not create or infer an approval record from that statement

#### Scenario: Context was omitted
- **WHEN** the evidence budget omits earlier observations
- **THEN** the assessment records that the trajectory is incomplete
- **AND** information absent from the remaining evidence is not reported as an observed fact

### Requirement: Explicit uncertainty and decision mapping

An assessment SHALL distinguish `LOCAL`, `PREPARATION`, `PUBLICATION`, and `UNKNOWN`, and retain the judge's returned probabilities. TENET SHALL map sufficiently confident `LOCAL` and `PREPARATION` assessments to `ALLOW`, sufficiently confident `PUBLICATION` assessments to `ASK`, and `UNKNOWN`, low-confidence, or materially incomplete assessments to `BLOCK` with an insufficient-evidence reason. The configured decision threshold SHALL be recorded with the assessment. A confidence value MUST NOT be described as proof of correctness.

#### Scenario: Observed publication requires a decision from the user
- **WHEN** the assessment identifies publication above the configured threshold
- **THEN** TENET returns `ASK`
- **AND** the caller receives the policy identity, assessment, and available destination and action evidence

#### Scenario: Opaque script
- **WHEN** the proposed action invokes a script whose relevant behavior is absent from the available observations
- **AND** the judge cannot establish whether it publishes code
- **THEN** TENET returns `BLOCK` with an insufficient-evidence reason
- **AND** the result does not claim that a publication attempt was detected

#### Scenario: Low-confidence local classification
- **WHEN** the judge selects `LOCAL` but its probability does not meet the configured threshold
- **THEN** TENET returns `BLOCK` rather than silently treating uncertainty as permission

### Requirement: Judge failures do not authorize execution

TENET SHALL bound judge requests with a configured deadline and support cancellation. Missing credentials, timeout, provider errors, and malformed responses SHALL produce `BLOCK` with distinct failure reasons. A decision SHALL expose measured evaluation duration and available model identity. A late response after timeout or cancellation MUST NOT authorize the action.

#### Scenario: Judge times out
- **WHEN** a judge request exceeds the configured deadline
- **THEN** TENET returns `BLOCK` with a timeout reason
- **AND** a later successful response cannot change that invocation into an allowed action

#### Scenario: Malformed judge response
- **WHEN** the provider response does not satisfy the expected assessment contract
- **THEN** TENET returns `BLOCK` with an invalid-response reason
- **AND** it does not substitute a guessed assessment

### Requirement: Minimized external evidence and decision records

TENET SHALL send only the configured bounded evidence needed for its assessment to the judge. It SHALL exclude credential-bearing headers and configured sensitive fields from that evidence without changing execution arguments. It SHALL disclose that selected code and trajectory text are sent to an external judge. TENET's default decision records SHALL omit raw credentials, full source payloads, and full page contents. Explanations SHALL identify the policy, assessment, uncertainty, and failure reason without inventing a model-generated rationale.

#### Scenario: Tool input contains a credential
- **WHEN** an intercepted request includes a credential in a recognized sensitive field
- **THEN** the external judge input and TENET decision record omit that value
- **AND** any loss of relevant evidence remains visible to the assessment
- **AND** the actual execution arguments remain unchanged

#### Scenario: Decision has no generated explanation
- **WHEN** the judge returns a typed assessment and probabilities without explanatory prose
- **THEN** TENET explains its policy decision using those returned values and observed metadata
- **AND** it does not attribute fabricated reasoning to the judge
