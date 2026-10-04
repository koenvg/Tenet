# Proposal

## Why

The Inspector repeats status and requires readers to understand internal terms before they can identify a call or explain its assessment. The reviewed mockups show a simpler call-review flow that removes duplicate navigation and diagrams without removing recorded facts or safety limits.

## What Changes

- Show a bounded command or file-path preview in call rows and grouped call references. Label unavailable and shortened previews; keep full recorded arguments in the call detail.
- Replace the summary's repeated badges with named Tenet permission, tool result and assessment fields, one short reason, and the recorded mode and enforcement consequence. Preserve overlapping findings, actual blocks, failures, unknown results and inconsistent records.
- Remove the redundant Summary tab, decision map, connection animation and separate selected-check panel. Explain the call with a list of recorded rules, their outcomes and the checks that affected the decision.
- Merge Evidence and Details into Recorded data. Lead with readable submitted action and policy; retain exact evidence, questions, choices, responses, validation, lifecycle, identifiers, probabilities, thresholds and coverage in disclosures.
- Remove the four-tab evidence dock and Rich/JSON question switch. Use one readable question view with exact recorded JSON available separately.
- Put repeated uncertainty behind one session-wide sidebar entry. Lead group headings with recorded rule text and the shared issue, while preserving policy/profile/rule/gate identity and every available individual link.
- Move filters, manual refresh and healthy reader metadata out of the default view. Keep active filters and partial-coverage warnings visible. Collapse shared mode or result labels only when the displayed calls support the same recorded fact.
- Keep all views available by keyboard and on narrow screens. Retain project/session selection, pagination, deep links, automatic updates and stable mounted disclosure state.
- **BREAKING:** Replace the current Inspector navigation and map/dock presentation, not the recording or enforcement contract. Update public UI tests and guides rather than retain a second legacy layout.

## Capabilities

### New Capabilities

- `decision-inspector`: A simpler local call-review workflow with identifiable calls, separate recorded facts, direct rule explanations, readable evidence and bounded repeated-uncertainty review. This capability is named in the pending standalone-inspector change but is not yet in the durable spec inventory; reuse that identity instead of creating a parallel UI capability.

### Modified Capabilities

None. The durable Pi inspector-launch contract and policy-enforcement contracts remain unchanged.

## Impact

- Svelte Inspector components, presentation helpers and styles, especially `App.svelte`, `Detail.svelte`, `DecisionSummary.svelte`, `RuleDetail.svelte`, `EvidenceDock.svelte`, `RecordingDetails.svelte` and `QuestionView.svelte`. Remove map-only components and styles after their responsibilities have moved.
- Local reader projections in `src/inspector/archive-index.ts` and related response types. Introduce bounded evidence-derived display metadata without retaining full evidence in list caches, eagerly loading call details or changing BB thread-status output.
- Inspector component/browser tests, reader/presentation regressions, `DESIGN.md`, `docs/inspector.md` and `inspector/tests/README.md`.
- This proposal replaces the map-led layout in `DESIGN.md` and the identical-primary-badge presentation described in the pending `inspector-call-status` delta. It preserves that delta's permission/execution safety and the pending `owner-finding-triage` contract. Reconcile overlapping deltas before archive; do not rewrite their historical planning records here.
- The mockup reference is `reports/inspector-before-after.html` in source thread `bbthread://thr_4dzut45twi`. It contains fictional data only. Its static controls and mobile omissions are examples, not permission to remove production navigation or records.
- No new dependency, recording schema, evaluator question, policy decision, confidence threshold, approval mechanism or live provider call. No archive rewrite, deployment, owner-service restart, CLI/BB-status redesign or product implementation is part of this planning request.
