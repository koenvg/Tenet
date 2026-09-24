# Spec Delta

## Purpose

Provide consistent policy decisions and invocation lifecycle behavior to embedded and process-based agent integrations without requiring Pi or an interactive owner interface.

## ADDED Requirements

### Requirement: Host-independent policy behavior

TENET SHALL offer an embeddable runtime whose callers provide host/session identity, working directory, tool metadata, arguments and observed results without Pi objects. Equivalent evidence, policy, mode, configuration and judge responses SHALL produce equivalent assessments and counterfactual decisions across adapters. Existing rule parsing, integrity checks, confidence gates, WARN behavior, deadlines and evidence limits SHALL remain unchanged. Observe SHALL remain the default and SHALL neither veto nor request approval.

#### Scenario: Equivalent calls from different hosts
- **WHEN** Pi and Claude Code supply equivalent policy evidence and scripted judge responses
- **THEN** TENET produces the same would-decision and diagnostics, with actual permission differing only where declared host capabilities require it

#### Scenario: Unattended caller
- **WHEN** a caller has no interactive UI or Pi session
- **THEN** it can assess invocations without either dependency and cannot implicitly grant approval

### Requirement: Shared eligibility and freshness semantics

Every adapter SHALL select explicit `TENET_POLICY` relative to its session cwd or otherwise only local `TENET.md`. Only confirmed local absence without an override SHALL make a new session dormant. Empty overrides, unreadable files and invalid policies SHALL be unavailable. Dormant sessions SHALL create no assessments, approvals, evidence or invocation recordings. Once eligible, a session SHALL NOT become dormant on policy deletion. Selected policy identity and original argument identity SHALL be checked before releasing pending work; stale policy SHALL remain unavailable until a new session generation reloads it. Unavailable enforcement SHALL block; unavailable observation SHALL permit without claiming a pass.

#### Scenario: Dormant session
- **WHEN** a new session has no explicit policy and confirmed absence of local `TENET.md`
- **THEN** both modes bypass assessment and capture without a TENET veto

#### Scenario: Policy disappears after activation
- **WHEN** an eligible session loses its selected policy while an invocation is pending
- **THEN** the invocation cannot be released in enforce mode and the session is not reclassified as dormant

### Requirement: Capability-aware coverage

Each integration SHALL expose its host identity, verified version/profile and capabilities for interception, result correlation, lifecycle invalidation, argument stability and trusted approval. Unsupported or unverified guarantees SHALL be visible as coverage limitations, separately from activation, mode and assessment results. TENET SHALL NOT describe missing hooks, lost events or unsupported host composition as complete enforcement.

#### Scenario: Configured enforce with incomplete coverage
- **WHEN** an integration requests enforce but its host version or hook composition is unverified
- **THEN** status identifies enforce as configuration and coverage as unverified rather than certifying protection

### Requirement: Invocation identity and lifecycle isolation

TENET SHALL correlate calls using host, native session, execution context and native call identity plus a distinct TENET invocation identity. It SHALL isolate concurrent sessions and subagents, reject ambiguous call reuse, keep assessment snapshots independent of later results and invalidate pending work on known lifecycle changes. Late responses SHALL NOT authorize cancelled work. Recovered history SHALL contain only bounded TENET-associated observations, exclude observation findings and off-state actions, and disclose missing history. Unobserved execution SHALL remain unknown.

#### Scenario: Identical native IDs in two hosts
- **WHEN** Pi and Claude Code use identical native session and call IDs
- **THEN** their observations, pending work, decisions and outcomes remain separate

#### Scenario: Concurrent call and lifecycle change
- **WHEN** one context ends while another context has an assessment pending
- **THEN** invalidation affects the ended context without authorizing its late response or cancelling unrelated work

#### Scenario: Duplicate call identity
- **WHEN** a call ID is reused with conflicting arguments within the same execution context
- **THEN** TENET treats the identity as ambiguous instead of reusing an earlier permission

### Requirement: Trusted approval is optional but never inferred

In enforce mode ASK SHALL require trusted positive consent bound to the current unchanged invocation, session generation and policy snapshot. Without that capability, ASK SHALL block with an approval-unavailable reason while preserving ASK as the would-decision. History, agent text and ordinary host permission settings SHALL NOT establish TENET approval. Pi's existing native consent behavior SHALL remain intact.

#### Scenario: Approval unavailable
- **WHEN** a headless or Claude Code invocation produces ASK without a trusted approval channel
- **THEN** permission is blocked, no prompt is invented and no approval is recorded

#### Scenario: Existing Pi approval
- **WHEN** Pi obtains positive native consent and all invocation/policy/lifecycle checks still match
- **THEN** the unchanged pending invocation can be released under the existing approval contract
