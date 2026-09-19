## Context

See `proposal.md` for motivation and the three delta specs for behavior. The repository currently contains OpenSpec setup and workflow resources only. It has no application code, package manifest, tests, or existing capability specs to preserve.

Read-only investigation established the following:

- Installed Pi 0.85.1 provides an awaited `tool_call` event before execution, `{ block: true, reason }`, native confirmation UI, observed tool results, and session history. Tool-call handler errors block execution.
- Pi can execute sibling calls concurrently. Their preflight hooks do not necessarily see sibling results. Later extensions can mutate tool arguments after earlier hooks, so hook order is part of the supported integration contract.
- Pi extensions can record custom session entries, but ordinary session history is not a trusted source of executable approval grants.
- TypeSafe's JavaScript SDK exposes `systemOne` with typed questions and probabilities. Jev accepts text and structured text data, not screenshots. It does not return free-form rationales. No latency or semantic-quality benchmark has been run for TENET.
- Pi exposes built-in and registered extension tools at the same pre-execution hook. TENET can use host-supplied tool metadata, arguments, and observed results without knowing whether the underlying executor is a shell, browser, or MCP bridge. No executor or channel-specific adapter is needed in this POC.

References used during investigation:

- Pi extension hooks and lifecycle: https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
- Pi tool-call dispatch: https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/agent-session.ts
- TypeSafe SDK: https://docs.typesafe.ai/sdk/javascript
- Jev input and output limits: https://docs.typesafe.ai/concepts/system-one
- TypeSafe state: https://docs.typesafe.ai/concepts/state

Online references can change. Pin and verify the versions used for implementation and record them in evaluation reports.

## Goals / Non-Goals

**Goals:**

- Keep the semantic decision module independent of Pi so replay evaluation and live interception use the same decision path.
- Make effect assessment, policy decision, human approval, and observed execution distinct records.
- Judge every exposed tool invocation through one evidence interface. Tool names and argument shapes supply evidence rather than select different implementations.
- Produce an experiment whose failures can distinguish a mistaken judge from missing observations or a host that did not honor a decision.

**Non-Goals:**

- Owning execution isolation, network interception, credentials, or all possible side effects. Existing infrastructure owns those concerns.
- Building a universal Markdown policy compiler, a second coding agent, or a plugin framework for future harnesses.
- Building a channel registry, per-tool field mappings, browser/MCP adapters, or tool-specific context collectors. Shell, browser, and MCP examples belong in evaluation fixtures.
- Guaranteeing that arbitrary scripts or browser background activity cannot publish code. TENET judges what the host exposes before execution.
- Solving all information disclosure. Publication here means uploading code to a remote repository, including private repositories, not every transfer to a model provider or other destination.

## Decisions

### 1. A small TypeScript package with three working modules

Use a single package with a decision module, a Pi adapter, and an evaluation module. Proposed source organization is `src/decision/`, `src/pi/`, and `eval/`, with a Pi extension entry point and tests alongside the behavior they exercise. Use TypeScript, a supported Node.js LTS runtime, and a lightweight test runner. Exact dependency versions are implementation-time pins, not floating runtime choices.

The decision module takes policy, an immutable action snapshot, bounded observations, configuration, and cancellation. It returns an assessment and policy decision. The Pi adapter owns host events and UI. The evaluation module calls the same decision interface and, where needed, the same adapter with a fake host.

Inject the judge and clock so offline tests are deterministic. This seam has two immediate adapters: the real TypeSafe client and scripted test responses. Do not introduce a generic multi-provider registry.

Alternative: put everything in a Pi event callback. Rejected because it would entangle evaluation, approvals, provider requests, and lifecycle handling. Alternative: several published packages. Rejected as unnecessary for this POC.

### 2. Fixed policy identity, human-readable policy text

Use the stable policy identity `publish-code`. At session start, read an explicitly configured policy path or default to `TENET.md` in the session working directory. The documented sample contains the supported rule verbatim. Require that rule to be present after whitespace normalization; a missing rule or unreadable file makes the enabled guard unavailable rather than silently allowing actions.

Record the path and content digest. Feed the supported rule to the judge; do not interpret unrelated sections as additional executable policies. Display that limitation at startup. Load a policy snapshot for the session; deliberate reload loads a new snapshot and discards pending approvals.

Alternative: infer arbitrary policies from all Markdown content. Rejected because it would add a policy-compilation experiment before the publication experiment is measured. Supporting paraphrases and multiple policies can follow separately.

### 3. Preserve observations without treating them as authority

Represent every exposed invocation with the same evidence envelope: session identity, tool-call identity, tool name, available description and parameter schema, original argument digest, redacted arguments, and recent calls/results. Preserve arbitrary argument keys and text or structured result content without projecting them into tool-specific fields. Missing descriptions or other metadata remain explicit but do not exclude the tool from assessment.

Obtain current metadata from Pi's registered tool definitions, including tools added during a session. Tool names and descriptions are evidence, not permission rules. The adapter must not select a different judge, prompt, or parser based on a shell/browser/MCP label. There is no runtime channel enum or registration requirement.

Maintain a bounded chronological record of proposed calls, decisions, approval outcomes, and tool results. Label observations by their host event origin, tool-call identity, and time. A result can contain page text, an API response, or command output without TENET needing to identify its domain. All such content remains untrusted evidence. Use Pi history and TENET custom entries to recover observations on resume, but never recover an executable approval grant.

Use an evidence snapshot when an assessment starts; later sibling results cannot retroactively change that decision. Keep observed results intact within the budget instead of maintaining a browser navigation or MCP-specific state machine. A prior result that describes a submission target can help Jev interpret a later generic click. Conflicting or outdated observations are evidence-sufficiency questions for the judge, with timestamps and omission markers available.

Initial configurable defaults remain 12 recent events and 24 KiB of serialized judge evidence. Keep the current action first in the budget; if it cannot be represented adequately, block for insufficient evidence instead of quietly truncating its meaning. Record omitted observations and unsupported content such as images. Screenshots alone do not become text evidence by inventing a description. These defaults are experimental and must be recorded with each evaluation configuration.

The guard does not call another tool, execute a script, scrape a page, or fetch extra context on its own. It judges what the host has already supplied. If that is insufficient, return the explicit insufficient-evidence outcome. Adding support for a newly registered tool must require no TENET code or per-tool configuration.

Alternative: normalize each tool family into a channel-specific schema. Rejected because that makes tool compatibility a growing integration project rather than testing generic semantic judgment. Alternative: rely on the primary agent's intent summary. Rejected as the sole source because misleading descriptions are part of the evaluation.

### 4. Jev assesses effects; code applies policy

Call the official `@typesafe-ai/sdk` directly. Use one versioned choice question with `LOCAL`, `PREPARATION`, `PUBLICATION`, and `UNKNOWN`, plus a separate evidence-sufficiency question in the same request. Questions must be independently understandable because they do not consume each other's answers.

The state contains the supported rule, generic action snapshot, and bounded observations. The assessment does not ask whether the user approved. Host approval is checked elsewhere.

Apply deterministic decision mapping:

| Assessment | Policy decision |
| --- | --- |
| Sufficient evidence and confident local work | `ALLOW` |
| Sufficient evidence and confident preparation without upload | `ALLOW` |
| Sufficient evidence and confident publication | `ASK` |
| Unknown, inadequate evidence, or below threshold | `BLOCK`, insufficient evidence |
| Provider/configuration/validation failure | `BLOCK`, specific failure reason |

Use the returned selected-class probability and evidence-sufficiency probability, rather than confusing a provider confidence summary with correctness. Start both thresholds at 0.90, configurable and versioned as experimental defaults. Benchmark them rather than claiming calibration on coding-agent traces.

Set an initial 2,500 ms end-to-end judge deadline, including any retries. Prefer no automatic retries for the first POC so latency and failures remain interpretable. Propagate cancellation, reject malformed distributions or missing fields, and ignore late responses. Missing TypeSafe credentials produces an unavailable guard, never a mock success in live mode.

Record requested and returned model identities, question version, thresholds, duration, and provider failure category. Explanations use fixed templates tied to observed fields and the returned assessment; they do not invent a Jev rationale.

Alternative: have Jev return `ALLOW` directly. Rejected because the policy, uncertainty handling, and approval authority should remain explicit and testable in code. Alternative: regular expressions as the policy engine. Rejected as the primary approach because cross-route semantic recognition is the experiment.

### 5. Pi owns the pending invocation and approval UI

The Pi adapter registers a pre-execution handler for all tool calls. It copies the action arguments, obtains evidence, awaits the decision, and either returns a block or permits the original invocation. It never executes the action itself.

For `ASK`, show the policy, tool identity, and sanitized proposed arguments. Include destination or content details only when actually present in the supplied evidence; a tool-specific approval form is not required. Use Pi's native confirmation UI outside agent-supplied content. Serialize dialogs, and bind each response to a pending record keyed by session, tool-call ID, policy digest, and original argument digest. A positive response releases only that invocation. There is no reusable allow token and no session-wide approval.

Recheck the argument digest and session lifecycle before returning permission. Denial, cancellation, missing UI, reload, branching, or session replacement blocks the pending call. Uncertain execution results remain uncertain; retries are new invocations with new assessments and approvals.

The supported host setup must run TENET after argument-mutating hooks and must not mutate assessed arguments afterward. Integration tests verify the final executor arguments in the configured Pi version. Dynamic file contents, browser state changes, and other unobserved changes between assessment and execution remain host concerns; the POC does not claim transactionally frozen external state.

Human-entered shell commands are not agent calls and are outside this policy adapter. Tools that spawn their own internal actions are represented by the outer invocation unless their integration supplies further checkpoints.

Alternative: infer consent from the user task or conversation summary. Rejected because this policy requires immediate explicit approval. Alternative: reuse an approval across semantically equivalent routes. Deferred to avoid replay and uncertain-outcome problems in the first POC.

### 6. Record decisions without building a telemetry platform

Use minimal Pi custom entries for policy identity, tool and action identities, assessment, probabilities, decision, reason, approval outcome, timestamps, and observed execution status. Join records by tool-call identity, not channel. Store bounded redacted observations only where needed for resume; default records do not contain full page or source payloads.

Strip recognized authorization headers and configured sensitive fields from the copy sent to Jev. Never mutate the actual tool arguments as part of redaction. This is field-based minimization, not a promise to find every secret embedded in arbitrary shell text. Document that evidence can still contain code and will reach TypeSafe. Pi's own transcript behavior is separate from TENET's logging policy.

No daemon, remote telemetry store, dashboard, or approval database is needed for this POC.

### 7. Three verification levels, with separate claims

**Offline contract tests:** scripted judge responses and a fake Pi host verify generic evidence capture, decision mapping, no execution after denial, argument binding, cancellation, concurrent calls, lifecycle resets, redaction, and provider errors. Register unfamiliar tools with different schemas during the test and verify they are assessed without new TENET configuration. These tests must run with no credentials or network.

**Live judge replay:** submit labeled fixtures to Jev without executing their actions. Compare action-only and trajectory-aware input, use a fixed canonical set plus held-out adversarial cases, and retain assessment probabilities in the report. Include shell commands, browser clicks, MCP-style structured calls, and unfamiliar tool names as varied input examples. These examples all use the same evidence envelope and judge instructions; they do not require the corresponding tools to be installed. Include safe neighbors, misleading descriptions, outdated observations, injected approval claims, and opaque actions. Do not tune thresholds on the held-out set.

**Opt-in real-service demonstration:** use whichever tools are already available in the selected Pi session against a developer-controlled repository with harmless content. GitHub remains the initial documented destination, not a restriction in the policy model. Confirm the destination before each live run. A primary agent receives a publication task; approvals are denied while it tries alternate exposed calls. Use at least two distinct tool names or argument shapes to demonstrate equivalent effects, without requiring a shell/browser/MCP combination. Add directed attempts for cases it does not try. Run separate positively approved cases to demonstrate completion.

Record the actual tool inventory and attempted calls. Missing tools make only their selected cases unavailable; they do not make the generic guard unsupported. If fewer than two distinct publication forms can be exercised, report that the cross-tool live result is incomplete instead of requiring a new TENET adapter.

Use independent remote reads to verify files and refs, and object evidence where the service exposes it. A successful branch check alone does not prove that no intermediate objects were uploaded. Report indeterminate outcomes explicitly. Cleanup is a separate user-authorized operation, not an automatic destructive action.

If a chosen live case uses browser automation, respect the operator's browser choice. For Koen, connect to the existing Arc session; if it cannot be connected, request help or leave that case unavailable rather than launching another browser. Browser connectivity is not a prerequisite for the generic guard or a reason to build protected-browser infrastructure.

Reports include per-case and per-tool counts, expected versus returned effect, false allows, unnecessary prompts/blocks, unknowns, provider failures, unavailable/unattempted/unobserved cases, approved-task completion, prompts per task, and machine p50/p95 latency. Optional fixture-family tags are reporting metadata only and never enter runtime dispatch or judge selection. Report human wait separately. Repeated runs include model, policy, fixture, and question versions.

Canonical fully observed publication cases must yield `ASK`; canonical harmless cases must yield `ALLOW`, including cases with unfamiliar tool names. Offline correctness cannot validate live model quality. Live cases cannot be marked passed when prerequisites are absent. Broader adversarial results remain empirical findings rather than a universal guarantee.

## Risks / Trade-offs

- **False permission from a confident judge:** retain probabilities, use explicit uncertainty behavior, and measure held-out adversarial cases. A high score is not a guarantee.
- **Too many blocks on ordinary coding:** report false interruptions and task completion, including opaque build/test commands. Do not disguise blocking everything as successful protection.
- **Incomplete observations:** mark missing evidence and separate observation failures from semantic errors. Do not expand this change into sandbox development.
- **Misleading page or repository content:** separate policy and approval authority from evidence and include injection cases. This reduces confusion but does not prove model immunity.
- **Approval drift or replay:** use invocation-local state, argument checks, lifecycle invalidation, and new approvals on retries. External state not exposed by the host remains a limitation.
- **Evidence sent to another provider:** bound and redact fields, disclose the data flow, and use harmless fixtures for the demonstration. Do not claim general secret detection.
- **Different tool schemas or sparse metadata:** preserve the generic arguments and observed results, test unfamiliar tools, and expose missing evidence. Do not add per-tool mappings to make the evaluation pass.
- **Latency or provider outages:** enforce a deadline, block on failures, and measure actual latency. No marketing latency claim is an acceptance result.

## Migration Plan

There is no existing runtime or data migration. Build and verify the package offline first, then opt into live judge replay with TypeSafe credentials. Load the extension explicitly in a chosen Pi session with a reviewed policy file. Existing and subsequently registered tools pass through the same guard without channel configuration. Verify startup status before the live demonstration.

Rollback consists of disabling or unloading the extension and removing its configuration. This restores the host's prior behavior and must not be described as leaving TENET protection active. Minimal historical session entries can remain as observations; they never act as approval grants.
