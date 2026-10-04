# Design

## Context

See [the proposal](proposal.md) for motivation and [the decision-inspector delta](specs/decision-inspector/spec.md) for required behavior.

The current Svelte client already has a simpler default summary and closed Why this assessment, Evidence and Details disclosures. `App.svelte` owns session selection, call filtering, paging, automatic updates and the separate uncertainty-group view. `Detail.svelte` owns selected-rule state, the map and evidence dock. `presentation.ts` projects recorded facts; it must not evaluate policy.

`ArchiveIndex` discards parsed evidence after extracting metadata. `InvocationSummary` has tool identity and status but no command/path. Group references have only call identity and time. The reviewed mockups therefore need a small reader projection change as well as a frontend change. Fetching every full call detail to label a list would defeat existing read limits.

Current SDK-backed Pi records do not establish execution from native results without exact correlation. Historical execution records remain valid under their recorded contracts. `primaryStatus` already handles released/unknown, actual blocks, tool failures and contradictory permission/result records.

The pending standalone-inspector change introduces `decision-inspector`; no durable spec currently has that capability. This change reuses its name and adds the simplified review requirements. The pending `inspector-call-status` delta expects identical single primary badges in list and summary. This design intentionally replaces that presentation with named summary fields and compact list context, preserving its factual matrix. Do not claim that older delta is already synchronized. `owner-finding-triage` grouping and incomplete-coverage rules remain constraints.

The visual reference is the fictional-data HTML in source thread `bbthread://thr_4dzut45twi`, storage-relative path `reports/inspector-before-after.html`. It is a design example, not a runnable production specification. The decisions below resolve its static controls, missing mobile call navigation and overly broad session labels.

## Goals / Non-Goals

**Goals:**

- Keep recorded-data projection separate from policy evaluation and UI layout.
- Give call identification one bounded representation shared by list and group labels.
- Replace duplicated presentation rather than retain old and new interfaces behind switches.
- Keep the existing archive budgets, local access protections and mounted-state behavior.
- Preserve existing status-regression coverage while changing its public UI entry points.

**Non-Goals:**

- Changing approval, confidence gates, evaluator questions, authenticated action resolution or host result correlation.
- New schemas, archive migration, active reader restarts, external services, new UI dependencies or changes to BB status semantics.
- Rebuilding the session picker, redesigning the marketing site or copying private recordings into design/test fixtures.

## Decisions

### 1. Use one call-review workspace

Keep the neutral Calls sidebar and white selected-call workspace, existing sidebar resizing and current fonts/colors. Remove the desktop Summary/Uncertainty groups switch. Put one expandable Repeated uncertainty entry in the session sidebar, outside the filtered call list and its empty-state branch. Keep group loading lazy when this entry opens.

The selected call has a summary and two native disclosures:

```text
Selected call
  Action, mode, permission, result, findings, reason
  Why this assessment
    Recorded rules and their checks
  Recorded data
    Readable submitted action and policy
    Exact evidence
    Recorded questions and responses
    Recording and coverage
```

Native disclosures already provide keyboard behavior and preserve mounted state. Do not replace them with a new tab library. Keep them closed for a new invocation; unchanged polls do not close or recreate them.

**Alternative:** Keep the current navigation and add shorter labels. Rejected because it retains duplicate summary navigation, three technical destinations and the separate map/check selection path.

### 2. Present facts explicitly rather than repeat badges

`DecisionSummary.svelte` presents named Tenet permission, Tool result and Assessment rows. Keep recorded mode beside the action, all applicable finding categories and one concise reason from existing recorded gates/lifecycle facts. The explanation must not imply a new model judgment.

Use the existing status matrix as the fact source:

| Recorded fact | Visible meaning |
| --- | --- |
| Successful correlated result | Ran, meaning a successful result was recorded, not a policy all-clear |
| Failed correlated result | Failed, not proof of no external effects |
| Blocked permission with no result | Actual Tenet block; tool result remains unknown/not recorded |
| Released permission with no result | Released; never Ran |
| Missing permission and result | Permission unknown; tool result unknown/not recorded |
| Blocked permission plus a result | Show both facts and an inconsistency notice |

Never infer permission from a decision or execution from approval. Retain observed versus counterfactual BLOCK/ASK wording. In the Observe-plus-blocked-permission anomaly, state recorded blocked permission; do not print the mockup's normal-case "Observe mode did not block this call" sentence.

List rows keep actual block, known result, incomplete assessment and finding cues. Ordinary common mode/released/absent-result wording can be shared only across currently displayed calls that all contain the same fact. Scope wording to displayed calls, not an entire session or supported archive. Recompute after paging, filtering and updates; expand exception rows immediately. Do not suppress overlapping findings in the selected summary.

**Alternative:** Rename Released to Allowed or Ran. Rejected because neither reliably describes execution, and Allowed also confuses actual permission with policy assessment.

### 3. Extract small display metadata during normal archive parsing

Add an evidence-derived preview projection for `command`, `path` and `file_path` string arguments in the recorded request payload. Use that key order, as the current detail preview does. Extract only from validated supported records; do not read current project files, resolve paths or infer trusted action semantics from tool names.

Use at most 512 UTF-8 bytes per preview value, without splitting encoded characters. Record whether it was shortened. Normalize whitespace only for the list label; full detail keeps the original captured value. Keep empty, non-string or missing previews explicitly unavailable. Treat truncation as display shortening, not new capture loss.

Extend the rebuildable reader metadata with these bounded labels and the recorded rule excerpts needed for group headings. Bound rule excerpts to 512 UTF-8 bytes each and the existing supported policy rule-count limit. Keep full policy text and all evidence only in detail reads. Fold the appropriate recorded request/begin metadata into invocation summaries and lazily generated groups; no frontend N+1 detail requests. Group references remain capped at their current limits.

This explicitly relaxes the cache's current "non-evidence fields only" convention to a small allowlist of evidence-derived display strings. Update its types/comments and budget tests accordingly. Do not spread preview-bearing objects into `ThreadFinding`, BB reports or unrelated APIs. Preserve metadata invalidation on changed/deleted stage files and all existing reader sweep/byte limits.

Previews can contain secrets because submitted strings can contain secrets. They remain under the same owner-only loopback access and never enter URLs, logs, analytics, provider requests or agent messages. There is no promise of new secret scanning.

**Alternative:** Hydrate the selected detail for every list row. Rejected due to repeated evidence reads, larger responses and unavailable previews beyond already-loaded rows. A recording-schema change is also unnecessary because historical request payloads already contain the captured arguments.

### 4. Replace the map with a direct rule list

`Why this assessment` renders recorded rules in the current finding-first order, each with full recorded text, line/severity and its outcome. Explain triggered confidence/evidence gates beside exact recorded readings and thresholds. Preserve approval, WARN/advisory, unknown gate coverage and built-in integrity distinctions. Do not compare values against current thresholds or classify new findings in the UI.

Put full distributions, raw gate IDs and exact recorded questions under that rule or link to the matching rule's Recorded data disclosure. Use stable rule identity for these links. Keep non-applicable evidence, absent probabilities and unknown future gates explicit. Preserve all rules, not just the first blocker.

Remove `AssessmentMap.svelte`, the map-only portions of `decision-map.ts`, map connection/animation styles and the independent selected-check state after the list covers their recorded facts. Retain any helpers still required elsewhere, including non-map icon/status functionality.

**Alternative:** Keep the map behind another advanced disclosure. Rejected because it retains a second explanation implementation and extra selected-check state. The recorded rule list owns the complete explanation.

### 5. Merge technical records, not their meanings

Replace `EvidenceDock.svelte` with a Recorded data component that composes the existing safe Markdown/question renderer and recording/coverage projections. `RecordingDetails.svelte` can remain an internal component, but no separate top-level Details entry remains.

Show submitted action fields first. Where captured `oldText`/`newText` exist, display them as recorded before/after text, not an actual filesystem diff. For other tools or malformed/missing arguments, display the available inert fields and explicit unavailable markers. Never run a diff tool, command or current filesystem read to reconstruct missing evidence.

Show recorded policy next, retaining source, target and digest on demand. Exact evidence includes all submitted state sections, chronological history, reference pools, omission/redaction markers and coverage metadata. Per-rule questions keep their exact captured text, choices, mappings and version. Use one readable rendering, with exact JSON in a disclosure rather than a Rich/JSON switch. Keep response truncation, original byte counts, validation failures and unavailable snapshots visible in the relevant section.

All content uses the existing inert text/Markdown safety rules. Recorded links and images do not become executable or remote resources. Preserve original numeric precision in exact views.

**Alternative:** Hide everything behind one raw JSON export. Rejected because it makes ordinary review harder and removes rule-to-question navigation.

### 6. Consolidate healthy controls, never exception notices

Use one session/archive menu for project/session selection, manual refresh, read-only explanation, build/schema status and ordinary capture metadata. Put inactive category filters behind Filter calls; an active category has a persistent chip and clear action even when the filter disclosure is closed. Keep category counts as distinct overlapping calls.

Keep warning banners outside both controls for incomplete/unknown reader coverage, newer unsupported records, unsafe/corrupt capture, indexing, capture loss and reconnecting updates. Their expandable details retain writer-wide counter meanings and bounded issue lists. Keep the relevant rebuild-and-restart instruction; no active service is restarted by this change.

**Alternative:** Hide all archive information in the menu. Rejected because a clean-looking supported subset could be mistaken for a complete archive.

### 7. Preserve grouping identity while improving labels

Use recorded rule excerpts and gate descriptions for headings, and action previews for invocation references. Keep the existing policy source/digest/target, profile, rule and gate grouping keys unchanged. Full keys and first/last timestamps stay expandable. When heading text collides across groups, add a visible recorded-policy/profile disambiguator; never merge by display text. Missing rule text falls back to the recorded rule ID with an unavailable note.

The same Repeated uncertainty entry stays reachable for a session with no selected call or no category matches. Keep count and omitted-link notices. Opening a group does not change call filters; selecting a call retains its existing deep link and restores focus to the selected-call heading.

**Alternative:** Keep a main-workspace group tab. Rejected because the bounded group contents fit an expandable session sidebar and do not need another default workspace mode.

### 8. Treat mobile navigation as necessary, not duplicate desktop tabs

Below the existing narrow breakpoint, keep Calls and Selected call navigation with consistent labels. The Calls view retains the full paginated list, active filter and Repeated uncertainty entry. From a selected call, provide a route back to Calls and its group entry. Selecting a grouped call opens Selected call and moves keyboard focus to its heading. Session/archive controls remain usable at both widths.

The static mockup hides non-selected rows on mobile only to keep its example short. Production must not reproduce that omission. Use the existing resize breakpoints and native disclosure behavior; do not introduce mobile-only data semantics. Long targets, questions and IDs wrap or scroll inside their own bounded regions.

**Alternative:** Remove all mobile view navigation to match the mockup. Rejected because it makes other calls and repeated issues unreachable.

### 9. Retain update and browsing state

Preserve `App.svelte`'s completed-refresh publication boundary, opaque URL parameters, project filters, pagination, selection restoration and session-scoped warnings. Keep components keyed by invocation and rule identity, not changing status or preview text. A preview arriving with a later request stage updates text without resetting selection or open disclosures.

Existing public test seams remain the recorded reader APIs, presentation functions, mounted Svelte components with mocked local responses, and built-app temporary archives. Update assertions for the new named fields and disclosures; do not delete difficult status, historical, delayed-result, grouping or inert-content cases because their old selectors changed.

**Alternative:** Recreate the selected detail after every poll. Rejected because it loses record scroll, focus and open-state guarantees.

## Risks / Trade-offs

- Previews add sensitive strings to list/group responses. Mitigation: an explicit bounded allowlist, the unchanged private access boundary, inert rendering and tests that BB/agent-facing projections contain none of those strings.
- Shared labels can overstate homogeneity. Mitigation: derive them only from displayed calls, state that scope and test paging, filters, unknown modes and late result stages.
- Removing the map loses a visual explanation preferred by some readers. Mitigation: keep complete rule facts in one direct list; use the reviewed before/after direction rather than ship parallel interfaces.
- Similar group headings can hide changed policy identity. Mitigation: keep grouping keys unchanged and display a disambiguator when headings collide.
- Merging technical views can lose question selection or disclosure state. Mitigation: stable rule/record identity, explicit rule-to-question links and delayed-stage/focus/scroll regressions.
- UI tests currently use Evidence/Details tabs and the map. Mitigation: migrate public entry points while retaining their original semantic assertions and offline fixtures.
- Other pending deltas describe the old presentation. Mitigation: record the presentation conflict here, leave old records unchanged during this change and reconcile capability requirements deliberately before archive.

## Migration Plan

1. Implement one replacement layout and bounded reader projections. Do not ship a compatibility switch or rewrite recordings.
2. Update Inspector guides and `DESIGN.md` to name the replacement paths, including all moved facts and warnings. Keep historical assessment records and earlier change artifacts unchanged.
3. Run the contributor offline verification sequence, focused archive/presentation tests, real-browser layout checks and the required single read-only completion review.
4. Owner deployment is separate. The owner rebuilds assets and restarts the reader to activate a changed installation; rebuilding alone does not change a running process. Do not restart an active service here.
5. Rollback restores the previous source/build through the owner and leaves recordings unchanged. Reconcile the pending standalone/status/triage spec deltas before any later archive/sync operation.
