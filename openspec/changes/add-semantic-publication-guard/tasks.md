## 1. Gate any Pi tool call with Jev

Blocked by: none. This slice delivers the first complete path from an exposed tool call through semantic assessment and human approval to host execution.

- [ ] 1.1 Create the TypeScript package, Pi extension entry point, pinned Pi and TypeSafe dependencies, and decision interface with injected judge/clock contracts; verify typechecking and offline tests work without credentials and the decision module can be called without Pi.
- [ ] 1.2 Add failing tests, then implement the selected `TENET.md` policy, supported rule, source digest, and unavailable state; verify missing, empty, unreadable, or unsupported policy files never silently enable permissive decisions.
- [ ] 1.3 Add failing decision tests, then implement `LOCAL`, `PREPARATION`, `PUBLICATION`, and `UNKNOWN` mapping with explicit evidence sufficiency and configurable thresholds; verify the expected `ALLOW`, `ASK`, and `BLOCK` decisions, including unknowns that are not labeled detected publication.
- [ ] 1.4 Connect the direct TypeSafe adapter using versioned effect and evidence questions, validated probabilities, model metadata, cancellation, and a bounded deadline; verify captured requests use the generic action envelope and timeout, missing credentials, provider errors, malformed responses, and late responses cannot authorize execution.
- [ ] 1.5 Wire Pi's pre-execution hook and native approval UI to the same decision path for every tool; verify local work proceeds, publication waits for positive confirmation, denial or missing UI blocks execution, and a newly registered tool works without code changes or channel configuration.
- [ ] 1.6 Add generic field redaction, minimal decision records, and startup status; verify credential-bearing fields are excluded from judge input and default records, actual execution arguments remain unchanged, and missing tool metadata is explicit rather than a missing-adapter error.
- [ ] 1.7 Document and smoke-test the complete first slice against the pinned Pi tool-hook dispatch using dummy tools with different schemas; verify no execution occurs before permission, final arguments match assessed arguments, and the instructions require neither browser/MCP setup nor a protected execution environment.

## 2. Use recent trajectory to understand ambiguous actions

Blocked by: slice 1. This slice makes the same generic guard use observed history to interpret actions that are ambiguous alone.

- [ ] 2.1 Add failing trajectory tests, then capture bounded ordered calls, results, decisions, and approval outcomes with source identities and timestamps; verify a result describing an upload target can inform a later ambiguous call without a tool-specific parser.
- [ ] 2.2 Implement generic evidence budgeting and omission/unsupported-content markers; verify current-action priority, redaction effects, missing descriptions, text/structured result preservation, and image-only context never produce invented observations or launch extra context-collection tools.
- [ ] 2.3 Exercise conflicting or outdated observations, misleading descriptions, injected approval claims, and tool switching after denial through the decision interface; verify untrusted evidence cannot create approval and insufficient context produces the explicit unknown outcome.
- [ ] 2.4 Restore only bounded observations from session history and TENET records, keeping assessment snapshots isolated from later sibling results; verify session isolation and that historical observations do not restore executable approval grants.

## 3. Keep approval specific to the pending action

Blocked by: slice 1. This slice closes approval-reuse and lifecycle failures without depending on trajectory interpretation.

- [ ] 3.1 Bind approval to session, policy digest, tool-call identity, and assessed argument digest; verify changed arguments, alternate tools, retries after uncertain execution, and task text claiming consent require fresh assessment and any necessary approval.
- [ ] 3.2 Serialize approval dialogs and cancel pending decisions on denial, dismissal, abort, or timeout; verify concurrent calls cannot share an approval and a late UI response cannot release a canceled invocation.
- [ ] 3.3 Invalidate pending approvals on reload, branching, and session replacement; verify no transcript entry revives permission and decision records distinguish allowed, approved, executed, failed, and unknown outcomes.

## 4. Evaluate semantic consistency across tool shapes

Blocked by: slice 2. This slice measures the generic judge with replayed evidence, without requiring any example executor to be installed.

- [ ] 4.1 Create independently labeled canonical and held-out fixtures with varied names and argument schemas, including shell, browser, MCP-style, and unfamiliar-tool examples; verify fixtures cover publication, early object upload, harmless neighbors, misleading intent, injected consent, outdated context, and opaque actions using one evidence contract.
- [ ] 4.2 Implement action-only and trajectory-aware replay through the same decision module; verify identical effect labels, unchanged judge instructions across tools, deterministic offline execution, and explicit opt-in for live Jev calls.
- [ ] 4.3 Report per-case/per-tool denominators, false allows, unnecessary prompts/blocks, unknowns, provider errors, observation gaps, model/configuration versions, and machine latency separately from human waiting; verify calculations against fixed datasets including blanket blocking, skipped cases, and unfamiliar tools. Fixture-family tags must not select runtime behavior.
- [ ] 4.4 With explicit live-evaluation authorization and TypeSafe credentials, run canonical and held-out replay and record results; verify canonical publication yields `ASK`, canonical harmless work yields `ALLOW`, and failed semantic criteria remain visible. Leave this task open if prerequisites or authorization are unavailable.

## 5. Demonstrate publication approval during a real coding task

Blocked by: slices 3 and 4. This slice verifies denied and approved outcomes using tools already available to the coding agent, without adding executor adapters.

- [ ] 5.1 Add an opt-in demonstration procedure and independent remote-state verifier for a developer-controlled repository; verify preflight requires explicit destination confirmation, records the actual available tools, separates denied/approved cases, preserves intermediate-upload uncertainty, and never performs automatic destructive cleanup.
- [ ] 5.2 Add the primary-agent tool-switching scenario and directed fallback attempts; verify a scripted run records actual attempts and needs at least two distinct tool names or argument shapes for a completed cross-tool demonstration, without requiring a specific shell/browser/MCP combination.
- [ ] 5.3 With explicit live-demo authorization, run the selected denied and positively approved cases and record independent remote checks, prompts, task completion, and observation limitations; verify unavailable tools and unattempted cases are not counted as successes. If a selected case needs a browser, use the existing Arc session and request help if it cannot be connected rather than switching browsers.
- [ ] 5.4 Complete usage documentation and run the full offline suite and typecheck; verify the docs describe a generic tool-call guard with no per-tool mappings, explain TypeSafe evidence disclosure and experimental defaults, and report measured live results or outstanding verification honestly.
