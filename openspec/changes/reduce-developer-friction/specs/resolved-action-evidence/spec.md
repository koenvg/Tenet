# Resolved action evidence

## Purpose

Give TENET concrete, bounded evidence about the operation a host is about to execute, without treating agent-supplied descriptions or historical guesses as trusted facts.

## ADDED Requirements

### Requirement: Provenance-bound action facts
TENET SHALL accept optional versioned action facts from an authenticated executing-tool or host integration. Facts SHALL identify the host, session, execution context, invocation, original argument digest, integration version, supported operation semantics, resolved resources and material limitations. Agent arguments, tool names, tool descriptions, transcript prose and evaluator output SHALL NOT establish trusted facts or complete effect coverage. Facts SHALL describe literal content separately from code that the invocation executes. Missing facts SHALL remain explicit rather than becoming claims of no side effects.

#### Scenario: Literal code in a file edit
- **WHEN** a supported editing integration supplies a proposed patch containing a shell command as text
- **THEN** the evidence identifies the file mutation separately from that literal text and does not claim that the shell command executes

#### Scenario: Forged safe-tool description
- **WHEN** an unregistered tool describes itself as read-only or supplies a purported trusted-facts object in its arguments
- **THEN** TENET treats those strings as untrusted evidence and does not grant complete effect coverage

### Requirement: Resolved target identity before assessment
For a supported anchor-edit integration, TENET SHALL receive the executor's resolved target, relevant before/after edit information and a binding to the resolver state before assessment. Enforcement SHALL revalidate that binding before releasing permission. An absent, stale, ambiguous or unsupported resolution SHALL remain an explicit material gap when target identity matters. A matching anchor in old transcript text SHALL NOT substitute for current executor resolution. Policy-integrity assessment SHALL use the active source and resolved target independently of whether other rules pass.

#### Scenario: Documentation edit with an opaque anchor
- **WHEN** an anchor-edit integration resolves an edit to a documentation file distinct from the active policy
- **THEN** the evaluator receives that resolved target and the text edit, rather than only the anchor or an assumed policy target

#### Scenario: Target changes before release
- **WHEN** the target or resolver state changes after assessment and before enforcement releases permission
- **THEN** TENET invalidates the assessment and does not release the changed operation under the old result

#### Scenario: Unsupported current host
- **WHEN** the host provides only anchor strings and has no authenticated resolver integration
- **THEN** TENET reports target-resolution coverage unavailable and does not fabricate a target or enable the trusted-facts exemption

### Requirement: Bounded and relevant evidence
TENET SHALL preserve the pending action and its material resolved facts ahead of optional history within the configured evidence budget. It SHALL retain relevant causal observations where possible, remove duplicate metadata before useful context, and explicitly mark omissions. If material current facts cannot fit, assessment SHALL remain unavailable or uncertain. Submitted facts SHALL use existing redaction and privacy rules; no unrestricted filesystem traversal, code execution or external-state probing SHALL occur to fill gaps automatically.

#### Scenario: Long preceding tool output
- **WHEN** a large previous result competes with current resolved edit evidence for the byte budget
- **THEN** TENET keeps the current edit evidence, bounds or omits history, and records the omission without claiming complete history

#### Scenario: Compound or opaque execution
- **WHEN** one invocation contains several operations or calls a script whose effects the integration cannot resolve
- **THEN** facts cover every known operation and mark the unresolved effects; a harmless first operation does not certify the entire invocation

### Requirement: Explicit integration coverage
Owner diagnostics and recordings SHALL distinguish authenticated complete facts, authenticated partial facts, historical evidence and unsupported resolution. An integration SHALL pass conformance tests for its declared semantics, alias handling, cancellation and argument/target stability before it can advertise complete coverage. Generic runtime tests alone SHALL NOT certify a deployed host or tool package.

#### Scenario: Contract tested without a live adapter
- **WHEN** only an injected test integration supplies resolved facts
- **THEN** reports identify contract-test coverage and continue to show deployed host resolution as unsupported
