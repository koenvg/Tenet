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

## Pending completion gates

The Arc CDP endpoint responds at `http://127.0.0.1:9222`, but Playwright's browser connection timed out after the websocket connected. A second connection attempt with a 20-second timeout also failed. No alternate browser was launched. The browser suite failed setup, leaving all seven tests unexecuted. Reconnect the owner's Arc, then run `bun run inspector:test:browser`.

New screenshots have not been captured or visually inspected. Existing files in `.impeccable/review/` must not be treated as proof of this change. The updated browser suite captures the approved desktop, mobile and 2233px viewport set. Inspect that batch, fix together if needed, and confirm in at most one further pass.

The named Impeccable finish reviewer and documenter are not registered in this session's agent list. No independent finish verdict or documentation review has run. Arrange those checks after valid captures are available. `DESIGN.md` was already absent; this scoped refinement does not repair that pre-existing documentation gap implicitly.
