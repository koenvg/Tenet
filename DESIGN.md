# Inspector design

## Approved direction

Use this contributor guide to preserve the Inspector layout and recorded-data boundaries in a developer checkout. The selected call uses named permission, tool result and assessment facts.

The selected call is the default workspace. Calls has a directly visible Finding category select, with no repeated-group view. Recorded data replaces the Evidence dock and separate Details entry.

The fictional before/after reference is attached to TENET-57. Earlier layout references remain historical; `.impeccable/config.json` is unchanged.

## Layout

- The light toolbar has one Session / archive control for project/session selection, manual refresh, reader build/schema metadata and the read-only explanation.
- The neutral Calls sidebar puts the native Finding category select directly above the full paginated call list, without an accordion. Commands and file paths lead each compact row; tool names and times follow. Category counts, overlap guidance, active filter state and Clear filter stay visible. Calls scrolls independently of the selected call. Width starts at 300px, adjustable from 220–460px by pointer or keyboard.
- The selected call shows action, recorded mode, Tenet permission, Tool result, Assessment, applicable findings, recorded approval and one recorded-data reason. There is no desktop Summary/group switch.
- Why this assessment shows every recorded rule in finding-first order, led by exact rule text and compact confidence bars. Selected labels, exact scores and recorded thresholds stay within each reading; recorded uncertainty gates drive the flags. Question shortcuts, readable questions, repeated PASS notes, separate outcome rows and technical rule panels remain absent.
- One short archive-state indicator stays outside collapsed controls and both mobile views. It names partial or unknown coverage, indexing or capture issues; healthy state says Supported records, never complete capture. Recording issues holds exact reader counters, individual file issues, writer-wide counters, scope limits and reader build/restart guidance. It scrolls when expanded. Paused/reconnecting updates and other live alerts stay separate and visible.
- Recorded data has one Exact rule records and captured questions disclosure. It contains every retained reader rule record and original question object with question version, even if the application response is missing, unavailable or truncated. Native summaries and the scrollable JSON region retain keyboard access.
- Recorded data is one native disclosure, led by submitted action fields and captured policy. Exact state, chronological history/reference pools, the combined exact rule/question collection, SDK response/validation and recording/coverage have named native disclosures. There is no evidence tab dock or Rich/JSON switch.
- Submitted before/after text is not an executed diff. Exact JSON, full strings, captured policy identity, historical versions, precision, approval/lifecycle, identifiers and loss markers stay reachable. No current files or question templates reconstruct missing data.
- Below 900px, Calls and Selected call are separate views. Calls keeps all loaded rows, call pagination and the direct filter. Selecting a call opens Selected call; the Calls button returns to the list. No retained record is dropped.

## Appearance and motion

Use black type, a white workspace, neutral `#efefed` sidebar and muted `#be3737` recorded blocking contributions. WARN uses labeled advisory gates, not blocking contributions. Keep unknown coverage explicit.

List rows keep blocks, failures, unknown results and assessment concerns visible. Common mode, released permission and absent-result wording can move above the list only when every displayed call records that fact. The label says displayed calls, not the whole session. Filters, loaded pages and delayed stages recalculate it. Pending, incomplete, invalid and inconsistent calls retain individual cues.

Selection changes row background, not decision color. Shapes and text supplement color.

The wordmark uses bundled Kode Mono through the reader's existing font delivery and content security policy. Commands and exact data use monospace; ordinary copy uses the platform sans stack.

Call navigation uses 1rem/600 headings, .875rem command/path previews and .75rem tool/time/status metadata. The native Finding category select uses .8125rem labels with 44px minimum targets. Long bounded previews wrap rather than hide text. Recording issues uses 1rem body copy within 72ch; the collapsed archive-state line uses .8125rem.

Selected-call typography uses fixed rem roles: 1.5rem/600 call heading, 1.125rem/600 record headings, 1rem body and fact values, and .875rem labels, metadata and exact data. Prose is bounded to 70ch. Exact JSON wraps and scrolls without shortening strings or rounding numbers; browser zoom and user text scaling remain available.

Source: Google Fonts, `https://fonts.googleapis.com/css2?family=Kode+Mono:wght@400..700&display=swap`. SIL license: `inspector/src/fonts/OFL-Kode-Mono.txt`.

There is no connection, polling or entrance animation. Shared status icons remain authored SVG. Mock images are references, not shipping assets.

## Approved acceptance change

The owner clarified TENET-61: restore compact recorded-rule text and confidence bars under Why this assessment. Keep question shortcuts/readable questions, repeated PASS notes, separate outcome rows and Probabilities and rule details removed. Preserve the final typography and complete exact Recorded data. This supersedes the earlier whole-section removal, not recorded contract semantics. Historical plans, source checkboxes and reviews stay unchanged.

The owner then approved TENET-62's local sidebar and archive-warning revisions. Commands and files lead compact call rows. Finding category is a directly visible native select.

The entire Repeated uncertainty UI is removed, with no replacement view or group fetching by the UI. Public reader/group APIs, captured facts and semantic tests remain.

One short archive-state indicator replaces the two long top-level warnings. Recording issues keeps exact counters, scope limits and reader update guidance. The accepted selected-call pane and recorded contracts stay unchanged.


## Data boundaries

The React standalone Inspector uses `useArchive` in `archive-state.ts` and the shared `SummaryWorkspace` layout. Its private call-list slot, `CallSummary.tsx`, `RecordedRule.tsx`, `RecordedConfidence.tsx` and `RecordedData.tsx` read private archive fields without adding them to the shared summary model or BB input. Shared BB summaries retain their own safe presentation and pagination contracts. None of these components evaluates policy.

PASS with a recorded confidence gate is uncertainty, not a selected violation. Exact outcome/evidence choices, all distributions, recorded thresholds and gates remain in the exact-data destination. Missing fields stay missing; non-applicable evidence has no invented score. The UI never compares against current settings.

PASS can coexist with failed confidence. Missing or unknown data is not a pass. WARN does not block. Never invent evaluator reasoning or serial dependencies between independent checks.

Recorded `released` permission is displayed as **Not blocked by Tenet**. It means Tenet let the host proceed, not that a tool ran or an assessment passed. Unknown permission never receives that label. A blocked permission plus a result shows both facts and a warning, including observe-mode anomalies.

Lifecycle categories appear once in the named Assessment field. Violation, uncertainty and approval conditions remain separate overlapping findings. The private reader carries a bounded `assessmentInvalid` boolean from recorded validation markers to prevent an invalid completed record from appearing as Allow. This does not change recording contracts, finding classification or BB status.

Preserve atomic refresh publication in `archive-state.ts`. Unchanged polls must not mutate the workspace, move content, replay motion or replace mounted detail state. Keep deep links, manual selection, project filters, pagination, historical questions and exact recorded probabilities. Keep the single exact-records disclosure and scrollable data region mounted; captured UTF-16 identities remain lossless JSON data. Keep evidence nodes, scroll, open disclosures and keyboard focus through delayed stages.

The private metadata cache keeps action previews and at most 16 recorded policy-rule excerpts plus integrity. Each display string is bounded to 512 UTF-8 bytes, with explicit shortening/unavailable labels. Full evidence stays in selected detail. Ordinary call requests never load groups; unchanged group refreshes do not reread evidence. Neither display field enters BB status, agent messages, provider requests, logs or URLs. Existing BB finding policy-text fields are unchanged.

See [inspector use](docs/inspector.md) and [recorded evidence explanations](docs/inspection-evidence.md#recorded-and-inspector-explanations) for the reader-visible meaning.

## Verification status

These are recorded verification claims from the historical TENET-1 layout pass, not new checks run for a documentation edit. That pass moved session-wide uncertainty groups out of the sidebar and gave policy decisions more map space.

Desktop/mobile states were inspected in the local artifacts `coverage/inspector-artifacts/triage-{desktop,mobile,groups-desktop,groups-mobile}.png`.

That pass recorded:

- 14 passing component tests and 23 passing real-browser tests, including filters, group links, mobile navigation, resizing and historical deep links.
- TypeScript and Svelte checks without diagnostics.
- No findings from the Impeccable layout detector.

The previous KVG-5215 Request changes report is `.impeccable/review/kvg-5215-working-tree-review.md`. Its conflicting responsive grid and node offsets were corrected earlier.

The fresh TENET-1 layout review found three gaps: groups vanished without a selected call, target paths were hidden, and call-list responses eagerly included groups. Session-level group navigation, visible target identity and a lazy group endpoint resolved them. That earlier layout returned focus to the decision control. Before the group view was removed, group navigation returned focus to the visible selected-call heading. No second review pass was run.
