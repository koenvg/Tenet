# Decision inspector

## Purpose

Help owners identify recorded calls, understand their assessments and inspect retained evidence in a local read-only application. Reduce repeated presentation without losing historical facts, incomplete-coverage warnings or individual call access.

## ADDED Requirements

### Requirement: Identifiable recorded calls
Call rows and uncertainty-group references SHALL show a bounded command or file-path preview from the recorded submitted action when available. Shortened previews SHALL be marked. Missing or malformed previews SHALL use an explicit unavailable label and retain the call link. Previews SHALL NOT establish authenticated target resolution or execution.

#### Scenario: Two edits use the same tool
- **WHEN** two recorded edits target different files
- **THEN** their rows show the different captured paths without requiring the owner to open both calls

#### Scenario: Long or hostile arguments
- **WHEN** a recorded command exceeds the preview bound or contains markup
- **THEN** the preview remains bounded inert text, shortening is visible and the full captured argument remains available in Recorded data

#### Scenario: Historical action unavailable
- **WHEN** a historical call lacks a submitted command or path
- **THEN** its row identifies the tool and unavailable preview without reconstructing an action from current source or another call

### Requirement: Separate summary facts
The selected call SHALL show its action, recorded mode, Tenet permission, tool result, assessment findings and one short recorded-data explanation. Actual permission, observed execution, approval and counterfactual enforcement SHALL remain distinct. Released permission or approval SHALL NOT imply execution. Observe-mode BLOCK or ASK SHALL retain its counterfactual meaning.

#### Scenario: Released uncertain observation
- **WHEN** an observe call has released permission, no correlated result and uncertainty-only BLOCK
- **THEN** the summary shows Released, tool result not recorded and an uncertain assessment
- **AND** it states that this assessment would block in enforce mode without claiming this call ran

#### Scenario: Actual enforcement block
- **WHEN** blocked permission is recorded without an execution result
- **THEN** the summary and call row identify an actual Tenet block even when its assessment is uncertainty rather than a suspected violation

#### Scenario: Historical failed tool result
- **WHEN** a supported call has a recorded failed result and released permission
- **THEN** the result is Failed, not a policy block
- **AND** the explanation does not claim that the failure prevented all external effects

#### Scenario: Conflicting recorded facts
- **WHEN** blocked permission and a successful or failed execution result coexist
- **THEN** both facts remain visible with a prominent inconsistency notice
- **AND** neither is silently repaired or explained as current guard authorization

### Requirement: Honest assessment findings
The first view SHALL retain overlapping suspected violations, uncertainty, approval conditions, evaluator unavailability and incomplete observation. A missing, pending, dropped, cancelled, invalid or unavailable assessment SHALL NOT appear as no findings or a pass. Reported FAIL SHALL remain distinct from confidence-only gates and advisory findings.

#### Scenario: Mixed findings
- **WHEN** one call has a selected FAIL, low confidence and an approval condition
- **THEN** the selected call shows all three findings rather than replacing them with one headline

#### Scenario: Pending observation
- **WHEN** permission is released before assessment completes
- **THEN** the assessment says Pending without inventing a decision, passing checks or an all-clear

#### Scenario: Approval without execution
- **WHEN** an enforce-mode assessment required approval and an approval outcome is recorded
- **THEN** that outcome remains available separately from permission and tool result

#### Scenario: Observed approval condition
- **WHEN** an observe-mode assessment selected ASK
- **THEN** its approval condition remains visible and states that approval was not requested by that assessment
- **AND** it does not imply permission, actual approval or execution

### Requirement: Consolidated review navigation
The Inspector SHALL use the selected call as its default detail view without a redundant Summary tab. It SHALL offer Why this assessment and Recorded data as the two main call disclosures. The decision map, connection animation, separate selected-check panel, evidence tab dock and Rich/JSON question switch SHALL be removed. Their recorded facts SHALL remain accessible in the replacement views.

#### Scenario: New call selection
- **WHEN** the owner selects a call
- **THEN** the default summary appears with the two named disclosures closed and no map or duplicate summary navigation

#### Scenario: Inspect technical records
- **WHEN** the owner needs questions, raw response, exact JSON or capture diagnostics
- **THEN** Recorded data exposes those records through named disclosures without a format-toggle or four-tab dock

### Requirement: Direct recorded rule explanation
Why this assessment SHALL show every retained rule, led by recorded rule text, with source line, severity, outcome and relevant recorded gates or approval contribution. Affected rules SHALL precede rules without findings. Exact confidence readings and recorded thresholds SHALL be available beside their reason; full distributions and identifiers SHALL remain expandable. Missing scores SHALL stay unknown and not-applicable evidence SHALL not invent a score.

#### Scenario: PASS below the outcome threshold
- **WHEN** a rule selected PASS at 0.88 with a recorded outcome threshold of 0.90
- **THEN** its explanation identifies low outcome confidence rather than a selected violation
- **AND** it retains the exact selected label, score, threshold and evidence reading

#### Scenario: All rules remain inspectable
- **WHEN** several rules contribute findings and others have no recorded gates
- **THEN** each rule's snapshot and checks remain accessible in the same explanation
- **AND** built-in integrity is distinguished from owner-authored policy rules

#### Scenario: Missing and non-applicable readings
- **WHEN** a historical threshold is missing or evidence confidence did not apply under the recorded contract
- **THEN** the rule identifies the missing or non-applicable value without computing a replacement from current settings

### Requirement: Readable and exact recorded data
Recorded data SHALL lead with readable submitted action fields and the recorded policy. It SHALL retain exact submitted evidence, recorded questions and choices, SDK response, validation, approval, lifecycle, versions, identifiers and coverage limits. Readable views SHALL preserve omission, redaction, truncation and unavailable markers and SHALL NOT substitute current files, templates or inferred model reasoning.

#### Scenario: Submitted edit
- **WHEN** an edit recorded path, oldText and newText arguments
- **THEN** the readable view shows those arguments as submitted changes, not proof of an executed edit
- **AND** exact captured JSON remains available

#### Scenario: Questions for several rules
- **WHEN** the owner opens questions from a particular rule
- **THEN** the correct recorded question text, choice definitions, rule mapping and contract version are available with exact JSON
- **AND** questions for other retained rules remain reachable

#### Scenario: Truncated or incomplete capture
- **WHEN** a response was truncated or shared evidence contains omissions or redaction
- **THEN** the readable view retains the applicable loss markers and byte counts
- **AND** unavailable data is not reconstructed or labeled exact

### Requirement: Reachable session-wide repeated uncertainty
Repeated uncertainty SHALL have one session-wide navigation entry and bounded expandable groups. Group headings SHALL lead with recorded rule text and the shared issue, retaining policy identity, profile, rule and gate, count, occurrence times, individual call links and overflow notices. Call filters SHALL NOT alter grouping or hide its entry when no call is selected or matches.

#### Scenario: Repeated uncertainty
- **WHEN** two calls share the same recorded policy identity, profile, rule and gate
- **THEN** one group explains the shared issue and provides both individual call references with captured action previews when available

#### Scenario: Similar rule text under different policies
- **WHEN** identical rule text appears under different policy identities or profiles
- **THEN** the groups remain separate and their visible labels distinguish them
- **AND** full recorded grouping identities remain inspectable

#### Scenario: No matching call
- **WHEN** an active call filter has no matches or a session has no selected call
- **THEN** repeated uncertainty remains reachable and session-wide

#### Scenario: Bounded group overflow
- **WHEN** more groups or invocation references exist than the bounded view includes
- **THEN** the Inspector shows the omitted count and retains access through the paginated individual call list

### Requirement: Compact controls with visible state
Inactive filters, manual refresh, reader build/schema metadata and ordinary recording metadata SHALL be available through named filter or session/archive controls rather than permanent main-view clutter. An active filter SHALL remain visible with a clear action. The Inspector SHALL retain an accessible read-only statement, project/session selection and manual refresh.

#### Scenario: Active category filter
- **WHEN** a category filter is active and its filter panel is closed
- **THEN** the selected category remains visible and can be cleared without opening technical recording details

#### Scenario: Healthy reader
- **WHEN** no reader or capture issue is recorded
- **THEN** its build and supported schemas remain available through the session/archive control without a separate healthy-status strip

#### Scenario: Select another project or refresh
- **WHEN** the owner opens session/archive controls
- **THEN** project filtering, session selection, pagination and manual refresh remain keyboard accessible without affecting enforcement

### Requirement: Proven shared context only
Repeated mode, permission or absent-result labels SHALL be collapsed into shared context only when every displayed call supports that exact recorded fact. The label SHALL state its visible-call scope rather than claim complete session coverage. Mixed, unknown, blocked, failed, pending or inconsistent facts SHALL remain visible per call. Shared context SHALL be recomputed after filtering, pagination and stage updates.

#### Scenario: Homogeneous visible observations
- **WHEN** all displayed calls record observe mode, released permission and no correlated result
- **THEN** common labels can appear once for those displayed calls
- **AND** the selected call still shows permission and tool result explicitly

#### Scenario: Later page or result changes context
- **WHEN** another loaded page or a new stage introduces a different mode, block or known result
- **THEN** shared wording no longer claims the old fact for every displayed call
- **AND** affected per-call status is visible without selecting that call

#### Scenario: Unknown historical mode
- **WHEN** one displayed call lacks recorded mode
- **THEN** it retains Mode unknown and is not silently included in a shared Observe or Enforce label

### Requirement: Prominent recording and reader exceptions
Partial coverage, unsupported schemas, corrupt or unsafe records, indexing in progress, capture loss, conflicting facts and paused live updates SHALL remain visible outside collapsed archive controls. Notices SHALL distinguish recording/reader problems from policy findings and retain bounded details and applicable rebuild/restart guidance. No supported subset SHALL be presented as a complete audit.

#### Scenario: Supported subset of an archive
- **WHEN** newer unsupported records coexist with supported calls
- **THEN** a visible warning explains partial coverage and how to update and restart the reader
- **AND** healthy-status consolidation does not hide the warning

#### Scenario: Writer-wide capture loss
- **WHEN** a writer reports failures or dropped stages
- **THEN** a visible capture-loss notice exposes counters as writer-wide, not per-call totals

#### Scenario: Live update failure
- **WHEN** automatic updates fail while existing calls remain readable
- **THEN** the Inspector identifies paused or reconnecting updates without replacing retained facts with a pass

### Requirement: Responsive keyboard review
Desktop and narrow layouts SHALL keep the call list, selected summary, repeated uncertainty, rule checks, recorded data and archive controls reachable with consistent names and keyboard focus. Removing desktop tabs SHALL NOT remove narrow-screen view navigation. Selecting a grouped call SHALL return focus to its selected detail; long targets and IDs SHALL not create page-wide overflow.

#### Scenario: Narrow screen
- **WHEN** the viewport is 390 pixels wide
- **THEN** the owner can switch between calls and the selected call, inspect repeated uncertainty and return without losing selection
- **AND** no record or control is removed solely to match the static mockup

#### Scenario: Keyboard inspection
- **WHEN** the owner uses only the keyboard
- **THEN** filters, archive controls, rule disclosures, recorded-data disclosures and grouped call links can be operated with visible focus

#### Scenario: Long identifiers
- **WHEN** a record has long paths, commands or identifiers
- **THEN** bounded previews and readable details wrap or scroll within their own region rather than overflowing the page

### Requirement: Stable historical browsing and updates
The new views SHALL preserve existing opaque session/invocation links, browser history, project filters, loaded pages and selected detail. Unchanged automatic updates SHALL NOT remount disclosures, reset focus, close records or move their scroll position. Stage updates SHALL publish consistent facts. Historical interpretations SHALL use recorded policy, question versions and thresholds rather than current settings.

#### Scenario: Deep link beyond the first page
- **WHEN** an existing invocation link targets a call not on the first page
- **THEN** the call remains selectable and browser back/forward restores its selection

#### Scenario: Delayed result
- **WHEN** a correlated result arrives after permission and assessment
- **THEN** the call row and selected result update from unknown to the recorded result without losing open records, focus or scroll position

#### Scenario: Unchanged poll
- **WHEN** polling returns unchanged recorded facts
- **THEN** the selected rule disclosures and mounted evidence remain stable without replayed animation

### Requirement: Bounded private read-only inspection
The Inspector SHALL remain offline-capable, loopback-only and read-only. Previews and readable records SHALL render archived strings inertly and remain within existing private archive access. List/group responses SHALL contain only bounded display metadata, not full submitted evidence or eager call-detail payloads. Display strings SHALL NOT enter URLs, BB thread-status reports, agent context or evaluator inputs.

#### Scenario: Bounded list refresh
- **WHEN** the call list or groups refresh
- **THEN** responses retain existing pagination and group limits with bounded preview fields
- **AND** unchanged evidence is not reread or full details loaded just to create labels

#### Scenario: Hostile recorded text
- **WHEN** a command, rule or response contains HTML, script, links or instructions
- **THEN** it remains inert recorded content and triggers no execution, remote request or evaluator call

#### Scenario: Historical archive opened offline
- **WHEN** the owner opens retained recordings without Pi or provider credentials
- **THEN** the new review flow remains usable without changing records, asking a provider to reassess or exposing the server beyond loopback
