# Design

## Context

See [proposal.md](proposal.md) for motivation and the three delta specs for acceptance criteria.

The current implementation already uses `applicability-v1`. Its resolver contract admits authenticated facts through a trusted embedding registration, and `supportsExemption` rejects unsupported or partial operations. Stock Pi and Claude integrations do not register a resolver. This change does not alter that fact.

History preparation has two pruning points. `Observations.add` in `src/decision/trajectory.ts` sanitizes an event and evicts oldest observations against 12-event and 24 KiB defaults. `boundEvidence` in `src/decision/judge-evidence.ts` then removes optional current tool metadata and older history until the submitted state fits. Both favor recency, and neither compacts repeated content. Deduplicating only at final submission would be too late to recover events already discarded during admission.

The inspected call contained a preceding document in write arguments and an anchored auto-read echo. These representations are not necessarily equal strings. The new generic selector must not strip anchors or recognize a particular tool's output syntax to pretend they are identical. Exact repetitions can be compacted; nonidentical echoes are handled by history caps.

`RuleDiagnostic` currently describes validated gate outcomes and probabilities, not runtime coverage. `invocationView` folds recorded stages, and the inspector already separates observe-mode would-decisions from permission and execution. New explanations must extend that behavior rather than replace its decision model.

The current writer emits schema 3 and readers support schemas 1 through 3. The SDK exposes owner assessment results/events, and Pi retains live owner reports separately from archives. Both paths need the same evidence context even when recording is disabled.

## Goals / Non-Goals

### Goals

- Place history normalization and budgeting in one shared module, used during admission and final preparation.
- Preserve the pending action and authenticated facts without imposing tool-specific knowledge on TENET.
- Give callers a small diagnostic interface backed by recorded runtime facts.
- Make evidence preparation testable through captured submitted requests, immutable snapshots and owner events.

### Non-goals

- Semantic history ranking, another model pass, new executors or filesystem discovery.
- A model-generated rationale schema or changes to outcome distributions and approval behavior.
- Prompt instruction deduplication, archive-index repair or other independent cleanup.
- Guaranteeing that a particular invocation becomes ALLOW after its history gets smaller.

## Decisions

### 1. One generic history-preparation module

Add `src/decision/history-selection.ts` to own bounded sanitized history, repeated-string interning and snapshot selection. Keep `Observations` as the host-facing collection interface, delegating preparation rather than implementing a second set of pruning rules. `boundEvidence` protects the required current evidence and asks the same module for history that fits the remaining allowance.

The selection inputs are sanitized observation structure, event order and configured limits. The module does not inspect command vocabulary, rule text or tool-name classes. It does not authenticate anything. Its output is a frozen trajectory plus bounded selection metadata.

Admission remains bounded before copying arbitrary host JSON. Reuse `evidenceWithinBudget`, strict JSON copying and existing redaction. Oversized or unsupported inputs retain an explicit admission marker rather than inviting an unbounded normalization pass. Compaction runs before byte-driven eviction for admitted content. Host recovery and SDK history ingestion must use this path, rather than pre-slicing away everything that normalization could have retained.

Alternative rejected: a final-request-only deduplicator. It cannot recover history already lost by the live collection or SDK history pre-slice. A new generic relevance classifier is also rejected because it introduces a second fallible decision and another provider request.

### 2. Exact string references, not event deduplication

Use an invocation-local content pool under `state.trajectory.values`. Retained observations remain an ordered list with their own origin, session, call and timestamp. Pool only repeated sanitized string values of at least 256 serialized bytes, and only when the references plus one value save bytes. Keep short strings and non-string structure inline.

Use deterministic snapshot-local IDs, not digests of original secret-bearing values. A runtime-created tagged wrapper distinguishes a value reference from a literal object in historical data. Literal objects resembling that wrapper are escaped by the encoder, never interpreted as authored references. Every emitted reference must resolve inside its snapshot; remove unused pool entries after selection.

The decoder must reconstruct the exact retained sanitized value. It does not claim to reconstruct text that was shortened or rejected at admission. Retain separate event envelopes even when all their content matches. Two equal operations are still two operations, not proof that either ran.

Do not use fuzzy matching, strip hashline anchors, parse shell syntax or compare documents by semantic similarity. The reported anchored echo is a required nonidentical regression case, not a special normalization rule.

Alternative rejected: collapsing equal call/result events. That destroys chronology and can conceal repeated attempts or contradictory results.

### 3. Cap optional history independently of the current action

Keep the existing total evidence and recent-event configuration. Derive the optional-history allowance as the smaller of the capacity remaining after protected current evidence and one third of the configured state budget. Count trajectory envelopes, pooled values, excerpt markers and selection metadata against this allowance. At the 24 KiB default, optional history can occupy at most 8 KiB.

Before interning, bound each retained event's expanded content to one quarter of the history allowance, at most 2 KiB under default limits. This stricter expanded-content bound also prevents a shared large string from monopolizing the pool. Preserve event metadata and structured error/status fields where available, then use deterministic UTF-8-safe head/tail excerpts of remaining large strings. Every excerpt records original known size, retained ranges and an explicit omission marker. Bounded structural values that cannot be excerpted safely receive a marker instead.

Prefer newer call/result groups using recorded call identity only. Keep their surviving observations in original chronological order. Under pressure, shorten content before removing an entire group. A result that was not captured stays missing; matching a call ID does not imply success. If an envelope cannot fit, omit the group and increment the appropriate counter. Never manufacture a placeholder outcome.

Keep `recentEvents` as the maximum number of distinct retained events. Zero means no observations or pool. Limit pool entries to 256 and retain existing node/depth admission limits. Use serialized UTF-8 bytes, not JavaScript string length, for every capacity check. If protected current evidence alone cannot fit, retain the existing conservative insufficient-evidence behavior.

Expose aggregate counts for exact compaction, shortened events, dropped events and prior capture omissions. Do not combine lossless compaction with the existing omitted count. Keep omission detail bounded to retained groups plus aggregate counters.

Alternative rejected: filling all unused state capacity with the newest document. That recreates the reported noise pattern. This design deliberately leaves optional capacity unused when no additional bounded event can fit.

### 4. Evidence context is a separate diagnostic value

Introduce a readonly `EvidenceContext` value, separate from `RuleDiagnostic`, containing:

- Diagnostic and selection version identities.
- Action-resolution status and captured limitations, or an explicit unavailable status if capture did not complete.
- Current redaction indicators.
- History limits, bytes, retained-event count and exact-compaction/loss counters when preparation completed.

Derive this value once from the immutable invocation snapshot. Carry it through `Decision`, `Permission`, SDK assessment details, live owner reports and decision recordings. Pending or early-failure events can carry unavailable preparation status; they must not fabricate final counters. Once preparation completes, all consumers receive the same finalized sanitized value. Recording-disabled sessions still get live diagnostics.

Do not feed an explanatory diagnosis back into the evaluator or the agent's history. The submitted trajectory includes the selection metadata needed to interpret excerpts and references, but owner phrasing remains owner-only. Existing resolver status and limitations remain in the authoritative top-level `state.resolvedAction`; the new value neither replaces nor authenticates them.

Coverage gaps are invocation-level context. Rule gates remain the exact validated contributions. For example, show unsupported resolution alongside UNKNOWN without saying it caused UNKNOWN. Do not label omitted history as material to a rule unless there is recorded support for that claim. No new blocking gate or probability override is introduced.

Alternative rejected: assigning a guessed missing-fact reason to every rule. The provider currently returns choices and probabilities, not grounded rationales.

### 5. Version new evidence and recordings, preserve old records

Use a new current evidence identity, `bounded-history-v2`, and bump the generic question identity to `policy-rules-v7-evidence-selection` because the evaluator must understand runtime-created references and explicit excerpts. Keep the assessment profile `applicability-v1` and all outcome/evidence labels and validation rules unchanged. Add only generic representation instructions; do not add Git, email or tool-domain branches.

Advance new recording writes to schema 4 and add reader support for it. Record evidence context on decision/assessment stages and evidence-selection identity with requests. Schema 4 validators check the diagnostic shape and bounds. Schemas 1 through 3 remain historical reader formats, not alternate current runtime modes. Historical payloads remain raw recorded values. Do not run them through the new selector or infer current counters from missing metadata.

Update SDK types, archive validation, index metadata and inspector projection together. Older code may not understand schema 4 after rollback; it must report unsupported schema rather than reinterpret it. The new reader must continue to distinguish unknown data from no concerns.

Alternative rejected: attaching changed evidence meaning to the existing question identity or silently reinterpreting old requests.

### 6. Small owner-facing explanation changes

Use the existing decision summary for the primary explanation. Add one line for a fully captured, validated uncertainty-only assessment: "No rule was classified as violated. The decision is blocked by uncertainty." Use "would block" in observe mode. Never render that statement when recorded validation or complete rule results are unavailable.

Place a compact evidence-context summary beside that explanation. Show resolution coverage first, then history losses and exact compaction. Keep detailed diagnostics and the exact submitted content pool/excerpt markers in the evidence dock. Missing historical diagnostics say "Not recorded". Preserve independent permission, approval and execution displays.

At narrow widths, keep the decision and coverage summary before the detailed dock; do not add a permanent fourth pane. Verify keyboard access and the uncertainty/violation/unavailable states in the existing Svelte browser tests.

Alternative rejected: treating generic insufficient-evidence as an accusation or adding a large new analytics view for this change.

### 7. Evaluate changes without a second production implementation

Use sanitized authored fixture snapshots as the baseline and candidate snapshots prepared by the current selector. Both use the same generic question semantics and a common evidence envelope supporting inline values and runtime references. Do not retain the old selector as a production strategy, environment switch or legacy runtime branch.

Extend the existing evaluation support rather than put domain-specific behavior into `questions.ts`. Keep the reported command in fixture data with synthetic revision IDs and no local paths or original session IDs. Include exact duplicate and anchored-echo cases, arbitrary renamed tools, unrelated policy restrictions and controls that need earlier context. Include forged/stale fact references and actual prohibited effects under authored policies.

Offline scripted responses test mechanics, fixed gates, snapshot invariants and report denominators. They cannot establish semantic accuracy. A separate authorized live run can compare model outcomes, returned model identity, token usage and latency without executing any fixture action. Report smaller requests with unchanged uncertainty honestly. No live run is authorized by this proposal.

## Risks / Trade-offs

- Shortening history can remove a material observation. Mitigate with explicit excerpts, paired context-dependent controls and no safe-default inference from omissions.
- Exact string references will not eliminate every echoed document. Mitigate with generic event/history caps rather than host-specific text rewriting.
- References can confuse the evaluator or collide with untrusted lookalike objects. Mitigate with a tagged/escaped representation, decoder invariants, generic instructions and separately authorized semantic comparison.
- New caps can increase uncertainty in history-dependent cases. Keep these regressions visible; do not trade an unsafe allow for a lower benign-block count.
- Diagnostic propagation can drift between SDK, live Pi reports and archives. Derive one immutable value and test all public consumers with recording enabled and disabled.
- Unsupported stock-host facts still limit applicability. Preserve that gap explicitly. Cleaner history does not certify execution effects.

## Migration Plan

1. Add sanitized baseline snapshots and offline regression controls before changing selection. Record the pre-implementation commit for completion review.
2. Implement the single current selector, evidence context and versioned request/recording representation. Update all readers and report projections together.
3. Run focused evidence, runtime, SDK, recording and inspector tests, followed by the full affected-system commands in `CONTRIBUTING.md`.
4. Publish an offline comparison report with request-byte changes, preserved gates and explicit unverified semantic accuracy. Do not restart external services or change running host packages as part of verification.
5. Roll back by restoring the prior code revision and restarting only when explicitly authorized. Keep schema-4 archives intact; older readers must surface their incompatibility. Do not rewrite archives or reintroduce a production selector toggle.
