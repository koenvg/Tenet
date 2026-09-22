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
