# KVG-5215: simplify the decision overview

## Approved scope

Help the owner understand the latest decision without reading raw evaluator data. Preserve the existing visual identity and read-only archive behavior. Show action, policy decision and actual execution separately. Explain recorded reasons, make confidence thresholds visual, and collapse technical information. The owner approved testing through the existing inspector UI boundary.

## Changes

- `inspector/src/DecisionSummary.svelte` presents the action, decision and execution sequence with `DecisionIcon.svelte`. It shows recorded commands or paths, a plain-language explanation and explicit missing-assessment warnings.
- `ConfidenceMeter.svelte` presents exact recorded probabilities and threshold markers. It only appears for recorded confidence gates with valid numeric values. It does not recompute decisions.
- `Detail.svelte` replaces the permanent split evidence pane with a single reading column. All rules, evidence, questions, probability tables and recording identifiers remain available through disclosures.
- `RuleDetail.svelte` distinguishes a PASS outcome from failed evidence or confidence checks. Existing distributions, rule gates and historical question mapping remain available.
- `App.svelte` simplifies call rows and session labels, opens the newest call in the most recently updated loaded session on a fresh visit, and preserves explicit deep links and manual selection during polling. Session pagination retains its existing newest-started ordering; this is not a global latest-call query across unloaded sessions.
- `summary.css` implements responsive layout using the existing colors and type system. Mobile uses Calls and Summary navigation.
- The surface brief records the owner-approved composition. No evaluator, authorization, archive schema or server behavior changed.

## Verification

- Test-first checkpoint: the new visual-summary DOM assertion failed before implementation, then passed.
- Test-first checkpoint: fresh-visit automatic call selection failed before implementation, then passed.
- `bun run inspector:test`: passed, including the synthetic 0.85 evidence-confidence / 0.9 threshold / executed-in-observe-mode example, retained evidence state, hostile content, filtering, pagination, deep links and live updates.
- `bun run inspector:check`: passed with zero errors and warnings.
- `bun run typecheck`: passed.
- `bun test`: 228 passed, zero failed.
- Impeccable detector: one run over changed UI files, no findings. Output in `.impeccable/review/kvg-5215-detector.json`.

## Whole-page flashing follow-up

The live all-sessions API returned a `temporary-record` warning while the selected-session and invocation APIs returned no warnings. `refreshLive` rendered each response as it arrived, causing the recording banner to be inserted and removed on every poll and shifting the entire workspace.

`App.svelte` now stages refresh responses and publishes one completed update using the selected context's recording status. Failed or stale refreshes do not publish partial snapshots. Polling, actual recording warnings, delayed execution updates and selection preservation remain intact.

Regression evidence: adding a real temporary file in an unrelated archived session caused five DOM mutations during unchanged polling before the fix. The same test passes with zero mutations after the fix. Chrome browser coverage also passed with no summary movement across two completed polls.

## Chrome verification

The owner explicitly approved a separate Chrome debugging instance after Arc's CDP connection repeatedly timed out. Verification used the installed Chrome for Testing binary with a temporary profile and loopback debugging on port 9223. No signed-in profile was reused or modified.

- `TENET_BROWSER_CDP_URL=http://127.0.0.1:9223 bun run inspector:test:browser`: all eight tests passed.
- Inspected `.impeccable/review/desktop.png` at 1440px, `mobile.png` at 390px and `user-2233.png` at the owner's viewport. These captures use the documented synthetic archive fixture.
- Browser tests also verified 320px and 768px layouts, no horizontal overflow, resizing, disclosure behavior, focus, safe Markdown, evidence scroll preservation and refresh-error recovery.
- Checked the owner's actual running page at port 52320 and the supplied session/invocation link. Across two completed polls, observed zero mutations in the main workspace, no recording banner, and an unchanged summary position of 90px from the viewport top.

## Pending independent finish checks

The named Impeccable finish reviewer and documenter are not registered in this session's agent list. No independent finish verdict or documentation review has run. Arrange those checks after valid captures are available. `DESIGN.md` was already absent; this scoped refinement does not repair that pre-existing documentation gap implicitly.

## Decision map + Focus sidebar follow-up (in progress)

The owner subsequently approved replacing the whole inspector identity with Open map, then explicitly requested the Focus sidebar from `.impeccable/mocks/decision/tenet-focus.png` instead of horizontal call navigation. This supersedes the original identity-preservation scope above.

- Implemented the recorded-check map, separate execution summary, deliberate-selection trace and attached rule disclosures.
- Restored a vertically scrollable, keyboard-resizable left sidebar with action icons and a white selection joining the white workspace. Preserved session/project controls, pagination, deep links and atomic polling.
- The map stacks based on available workspace width, including after resizing. Mobile retains Calls / Summary navigation.
- Added local Kode Mono and its SIL license; the font is embedded into the built stylesheet, without widening the inspector server's asset allowlist.
- `DESIGN.md` now records this explicitly approved replacement direction. PRODUCT.md's stale planned-inspector wording remains untouched.

Test-first evidence: missing map/check selection, missing Focus sidebar/resizer, and missing UNKNOWN warning each failed before their implementations. Final checks: 228 core tests pass; offline inspector UI tests pass; Svelte reports zero errors/warnings; TypeScript and diff checks pass.

Browser verification is blocked, not passed. Temporary Chrome for Testing instances accept CDP connections but local-page navigation stalls before rendering; this also happens without request interception. The focused browser test times out in beforeEach at page.goto, then during failure capture. A subsequent CDP attach to a stalled target also times out. Neither headless nor ordinary Chrome resolved it. The updated ten-test suite and fresh desktop/mobile captures remain pending; existing captures describe the earlier overview. No signed-in browser profile was touched. The independent finish review remains outstanding.

### Sidebar decision clarity

Owner feedback on the sidebar requested a clearer allowed/blocked distinction. Restored semantic badge backgrounds and stronger labels, added distinct allowed/blocked/approval SVG symbols, and removed the selected-row override that made every decision gray. Sidebar approval uses amber. Observe-mode "Would allow/block" wording remains unchanged; these badges describe policy, not actual execution.

A new UI regression failed on missing decision symbols, then passed. Rechecked all 228 core tests, the offline UI suite, Svelte checks and TypeScript. Added browser assertions for badge foreground/background colors and selected-row color preservation; browser execution remains pending under the navigation blocker above.

### Completion review and responsive fixes

The single fresh-context completion review returned Request changes with two CSS findings. Its original report is retained at `.impeccable/review/kvg-5215-working-tree-review.md`. No second review was launched.

- P1: Removed the superseded workspace grid placements and 1100px mobile layout from `style.css`, and the competing divider breakpoint from `PaneResizer.svelte`. `summary.css` now owns workspace placements and the 900px mobile switch.
- P2: Reset stacked `.map-check` insets so relative positioning for branch stubs cannot retain desktop offsets.
- Added browser assertions for nonoverlapping panes and full-height dividers at 901/1024/1100px, contained check bounds and branch alignment at 320/390/768px and after resizing, and overflow within the invocation scroller itself.

After these fixes, the offline UI suite, all 228 core tests, Svelte checks, TypeScript and diff checks pass. The new browser assertions have not run because of the previously documented navigation blocker. Review findings are addressed in code, but current visual/browser verification and visual finish approval remain pending.

### Publication

The owner requested pushing the current implementation and marking PR #21 ready for review despite the documented browser-verification gap. GitHub readiness does not imply visual approval or a passing current browser suite. The PR description retains these limitations.
