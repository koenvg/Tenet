# Spec Delta

## Purpose

Let BB owners browse Tenet's recorded call and rule summaries beside a Pi conversation or from a project overview, without exposing raw evidence or mistaking missing assessments for passing results.

## ADDED Requirements

### Requirement: Project and linked-session overview
The BB Tenet page SHALL provide a project and Pi-thread picker and list sessions linked to the selected thread. Each session summary SHALL show recorded times, distinct-call category counts and coverage. Browsing SHALL require neither an active Pi process nor evaluator credentials.

#### Scenario: Open the main Tenet page
- **WHEN** the owner opens Tenet from BB navigation
- **THEN** the page provides thread selection and recorded session summaries rather than only instructions to visit a thread

#### Scenario: Stopped Pi process
- **WHEN** the selected Pi thread is stopped and its machine and archive remain readable
- **THEN** its linked sessions and calls remain browsable without starting Pi or contacting TypeSafe

### Requirement: Overview beside the conversation
The owner SHALL be able to open a Tenet overview tab from a Pi thread's header action without leaving the conversation. The tab SHALL select that thread automatically. The existing quiet header behavior SHALL remain; only validated selected FAIL findings SHALL contribute to its finding indicator.

#### Scenario: Open from a Pi thread
- **WHEN** the owner selects the overview action in a Pi thread
- **THEN** BB opens or focuses that thread's overview tab beside its conversation

#### Scenario: No selected FAIL
- **WHEN** available records contain passes, approval conditions, uncertainty or evaluator failures but no validated selected FAIL
- **THEN** the overview remains reachable and no broken-rule count appears in the header

### Requirement: No assessment coverage for non-Pi threads
The main picker and thread header SHALL offer Tenet assessment browsing only for Pi threads. Direct requests or restored panel tabs targeting other providers SHALL return an unsupported state without archive reads or claims of Tenet coverage.

#### Scenario: Non-Pi deep link
- **WHEN** an owner opens an overview route or restored tab for a Codex thread
- **THEN** it states that this overview supports Pi threads only and returns no archive findings

### Requirement: All-call timeline and category filters
A selected linked session SHALL expose a paginated timeline of recorded calls, including passes, selected FAIL findings, approval conditions, uncertainty, evaluator failures and pending observations. Filters SHALL use recorded categories, permit overlap and preserve distinct-call counts.

#### Scenario: Mixed outcomes
- **WHEN** a session contains a pass, an uncertain PASS, a selected FAIL and an evaluator failure
- **THEN** all four calls appear in the unfiltered timeline and the categories remain distinct

#### Scenario: Overlapping categories
- **WHEN** one call has both a selected FAIL and a confidence gate
- **THEN** both filters can include that call without counting it twice in a distinct-call total

### Requirement: Safe call and rule summaries
Selecting a call SHALL show its tool and call identity, recorded mode, assessment state, recorded rule text and selected outcomes with confidence and gate summaries. Built-in integrity SHALL remain distinct. Policy interpretation SHALL use each record's contract and policy snapshot, not current files.

#### Scenario: Policy changed after capture
- **WHEN** the current policy differs from the selected call's recorded policy
- **THEN** the summary uses the recorded rule identity, text and thresholds and does not reassess the call

#### Scenario: Rule summary limit
- **WHEN** the recorded rules exceed one summary page or include oversized text
- **THEN** the owner can continue through rule pages and sees explicit truncation or omission markers rather than a false complete result

### Requirement: Assessment, permission and execution remain separate
The overview SHALL display recorded assessment results, counterfactual decisions, actual Tenet permission and observed execution as separate facts. Released permission SHALL NOT imply execution. Missing or unsupported records SHALL NOT imply a pass or successful execution.

#### Scenario: Observe-mode finding
- **WHEN** a recorded selected FAIL would block in enforce mode but Tenet released the observe-mode call
- **THEN** the overview shows the finding and released permission separately, without claiming that Tenet blocked the call

#### Scenario: No exact execution correlation
- **WHEN** the recorded host contract supplies no exact execution result
- **THEN** the overview displays execution as unknown even if a BB transcript shows a successful tool result

### Requirement: Explicit evaluator failure and coverage states
The overview SHALL distinguish recorded evaluator failure from pending assessment, cancellation, dropped assessment and missing recording stages. It SHALL display safe recorded reason codes and incomplete coverage. A failure SHALL NOT count as a selected FAIL finding.

#### Scenario: Provider failure
- **WHEN** two calls have terminal unavailable assessments with recorded reason provider-error
- **THEN** the overview states that two evaluator assessments failed, shows no valid assessment for those calls, and does not describe them only as unfinished checks

#### Scenario: Archive and assessment problems coexist
- **WHEN** other archive records are corrupt and a selected thread has a recorded evaluator failure
- **THEN** the thread's evaluator failure remains visible and archive-wide warnings are identified separately

### Requirement: Exact thread and machine association
Archive reads SHALL run on the selected thread's BB machine, using the default or owner-configured private archive. Sessions, calls and rule pages SHALL include only records whose exact BB thread association matches the request. The backend SHALL reject client-selected machine IDs, archive paths and unrelated record identifiers.

#### Scenario: Same native session across BB threads
- **WHEN** two BB threads share a native Pi session identifier
- **THEN** each overview returns only its own linked calls and counts, including when opening a detail link

#### Scenario: Forged record selection
- **WHEN** a request names a session, call or continuation token belonging to another thread
- **THEN** the request is rejected without returning that thread's records

#### Scenario: Remote machine disconnected
- **WHEN** the selected thread's machine disconnects
- **THEN** the overview clears stale available results and reports unavailable without reading a local-machine archive as a fallback

#### Scenario: Historical records without a link
- **WHEN** a historical recording has no BB thread association
- **THEN** it remains available in the standalone inspector but is not attributed to a BB thread using directory, title or time

### Requirement: Bounded reads and stable live browsing
Session and call pages SHALL contain at most 50 summaries and rule pages at most 16 rules. Reads SHALL preserve the archive's bounded scanning and detail limits. Live updates SHALL preserve the selected session, call, filter and loaded older pages. Unavailable reads SHALL clear stale results and expose a retry action.

#### Scenario: Browse older calls during updates
- **WHEN** the owner loads an older timeline page and new records arrive
- **THEN** polling preserves the loaded pages and selection, and an explicit refresh can restart the timeline

#### Scenario: Rejected cursor or timed-out read
- **WHEN** a continuation token is rejected or a live read times out
- **THEN** the overview does not display old data as current and provides a page-one refresh action

#### Scenario: Incomplete indexing
- **WHEN** archive scanning reaches its configured stage or byte limit
- **THEN** the overview reports that indexing is incomplete and does not claim that its counts cover the whole archive

### Requirement: Read-only summaries and host-local raw evidence
BB SHALL receive only bounded allowlisted summary fields and inert recorded rule text. Raw tool arguments, command or file-content previews, submitted evidence, exact question payloads and provider response bodies SHALL stay host-local and SHALL NOT enter BB responses, URLs, messages or notifications. BB SHALL explain that detailed evidence remains in the standalone inspector.

#### Scenario: Secret in action or response text
- **WHEN** a recording contains a credential string in arguments, evidence or a provider response
- **THEN** BB summary responses and rendered views contain none of those source fields, and hiding an Evidence tab is not the only protection

#### Scenario: Hostile rule text
- **WHEN** a recorded rule contains script markup
- **THEN** BB renders it as inert text and executes no archived content

#### Scenario: Raw evidence requested
- **WHEN** the owner selects a call in BB
- **THEN** no raw-evidence or response request occurs and the view explains how to inspect evidence on the selected machine without launching or exposing a listener automatically

### Requirement: Shared summary behavior with standalone isolation
BB and the standalone inspector SHALL use the same summary presentation and classification rules for equivalent records. BB integration SHALL NOT weaken standalone loopback, Host, Origin or frame-embedding restrictions. The standalone inspector SHALL retain its existing evidence views and Pi launch behavior.

#### Scenario: Equivalent summaries in both applications
- **WHEN** equivalent fixtures appear in BB and the standalone inspector
- **THEN** both views use the same assessment, permission, execution and category meanings, while raw evidence is available only in the standalone view

#### Scenario: Integration without a local listener
- **WHEN** the owner opens the BB overview on a remote-machine thread
- **THEN** it uses BB's host connection and requires no browser-local inspector URL, iframe or standalone server

### Requirement: Responsive navigation and resource cleanup
The overview SHALL provide call browsing and a readable selected summary at desktop and compact widths, without page-wide horizontal overflow. Compact views SHALL offer separate Calls and Summary views. Closing, switching or reloading a view SHALL dispose its polling and mounted workspace and ignore late results.

#### Scenario: Compact overview
- **WHEN** the owner opens the overview at a 390-pixel viewport width
- **THEN** Calls and Summary remain reachable, coverage remains visible, and the page does not overflow horizontally

#### Scenario: Narrow panel in a wide window
- **WHEN** the owner narrows the thread overview panel to 390 pixels inside a wide BB window
- **THEN** the overview uses its compact Calls and Summary navigation without horizontal overflow

#### Scenario: Switch thread during a read
- **WHEN** a read for one thread finishes after the owner switches to another
- **THEN** its results cannot appear in the new thread's overview
