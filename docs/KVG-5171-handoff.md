# KVG-5171: live decision lifecycle inspection

## Scope

Implemented the live lifecycle slice of the approved `add-standalone-decision-inspector` OpenSpec change. The standalone inspector now refreshes persisted sessions, invocations and selected invocation detail every two seconds while remaining read-only and independent of Pi.

## Behavior

- The detail view labels counterfactual decision, native approval, actual permission and observed execution separately.
- Approval absence is explicit: non-ASK decisions are `not required`, observe-mode ASK is `not requested (observe mode)`, and an incomplete enforce-mode ASK remains `unknown`.
- Permission release never implies execution. Missing execution remains `unknown`; a later persisted tool result updates the open detail.
- Polling discovers new sessions and stages without a page reload. It retries after read failures and clears the reconnect warning after the archive is available again.
- Poll refreshes the mounted detail in place, preserving session, invocation, rule selection and scroll.
- Closing the standalone server does not affect an independent archive writer; recording continues.
- No approval, execution or rerun operation was added. Native approvals remain in Pi.

## Tests

- `test/inspector.test.ts` covers observe-mode would-block/released/executed states, enforce-mode approved and denied outcomes, unknown execution before a delayed stage, delayed API refresh, read-only access checks, and continued recording after server shutdown.
- `inspector/tests/ui.mjs` covers polling discovery of a new session and delayed execution, reconnect, preserved invocation/rule selection and scroll, distinct lifecycle labels, hostile inert evidence, and no provider network access.

## Verification

- `bun test`: 179 passed, zero failed.
- `bun run smoke`: 4 passed, zero failed.
- `bun run typecheck`: passed.
- `bun run inspector:check`: zero errors and warnings.
- `bun run inspector:test`: production build and DOM/HTTP test passed.
- `openspec validate add-standalone-decision-inspector --strict`: passed.
- `git diff --check`: passed.
- Impeccable detector reported the pre-existing selected-item side stripe; it was removed.

## Parent status

OpenSpec task 4.5 is complete. The parent change remains open; unrelated unchecked tasks in `openspec/changes/add-standalone-decision-inspector/tasks.md` remain out of this ticket's scope.
