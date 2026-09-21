# KVG-5169: explain every rule's contribution

Implemented the rule-inspection slice of `add-standalone-decision-inspector`. Parent tasks 4.3 and 4.4 are complete; the remaining parent work is unchanged.

## Changes

- Capture built-in integrity text at invocation start, including attempts without an SDK request. Capture each assessed rule's contribution, triggered gates and effective thresholds in the decision archive. This metadata does not enter Pi diagnostics or evaluator history.
- Project recorded contributions, question keys and references through the read API. Effective assessment thresholds take precedence over initial configuration. Missing contributions and gates remain explicitly unavailable in older or partial archives; the reader does not run current evaluation logic or load current policy/questions.
- The owner approved a full Decision debugger redesign after a shaping round. A call explorer now sits beside a pinned recorded-decision explanation, a finding-first rule inspector and a tabbed evidence dock. Every passing rule and built-in integrity remain accessible.
- The selected rule shows all outcome/evidence probabilities, selected labels, friendly gate explanations, raw gate IDs and thresholds. PASS below threshold is explicitly not a reported violation. Approval requirements and advisory WARN contributions have separate descriptions.
- Questions, shared evidence, response and policy use separate dock tabs. Evidence starts with action/arguments, followed by context and chronological history, without omitting other recorded fields. Selecting another rule updates its question mapping without resetting shared evidence scroll.
- Desktop panes resize by dragging their separators or using Arrow, Shift+Arrow, Home and End keys; the slider toolbar is removed. Narrow screens switch between Calls, Assessment and Evidence views while retaining selection.
- Reusable status chips distinguish green PASS/ALLOW/SUFFICIENT, red FAIL/BLOCK, amber uncertainty and violet approval. A low-confidence PASS remains green beside its separate confidence warning.
- Questions default to readable Markdown instructions and labeled answer choices. Rich / JSON switches to the unchanged recorded object. The renderer creates only controlled elements: archived HTML, links and images stay inert; no raw-HTML injection is used.
- Invocation summaries now expose recorded mode, permission and execution alongside would-decision. The API does not infer execution from permission.

## Verification

- Installed pinned Vitest 5.0.1, playwright-core 1.63.0 and marked 18.0.13; `bun.lock` updated.
- Test-first recording/projection checks failed before implementation and passed afterward.
- `bun test`: 184 passed, zero failed after the redesign.
- `bun run smoke`: three passed.
- `bun run typecheck` and `bun run inspector:check`: passed, zero Svelte warnings.
- `bun run inspector:test`: production build and DOM/HTTP tests passed.
- Offline scripted SDK fixtures cover low-confidence PASS, UNKNOWN, approval, insufficient evidence, evidence confidence, WARN FAIL and integrity FAIL. They compare persisted requests against actual SDK transport payloads and inspect all rules through two server starts after policy replacement/removal.
- Historical question text, unusual recorded thresholds and unknown gate IDs are preserved verbatim. Hostile rule/evidence text is inert in UI tests.
- Arc's existing localhost CDP connection was confirmed as the owner's Arc process. Desktop and 390px layouts were inspected with synthetic records; evidence navigation moved focus correctly and hostile content did not execute. No alternate browser or live provider was used.
- `git diff --check`: passed. The UI detector reported no findings after the redesign.
- Production UI tests cover contributing-rule selection, exact gate explanations, full distributions, pane resizing across calls, dock keyboard navigation, shared-evidence scroll preservation, missing requests/gates, truncated hostile responses, refresh errors and recovery.
- Earlier Arc captures at 1440px, 1280px and 390px are under `.impeccable/review/`. They predate the draggable dividers, green chips and Rich / JSON changes.
- Added six Vitest-driven Playwright tests in `inspector/tests/debugger.vitest.ts` and the `inspector:test:browser` command. They use Arc's existing CDP context and synthetic records, without downloading or launching browsers.
- The browser suite is currently blocked during CDP attachment: HTTP discovery and WebSocket connection succeed at port 9222, but Playwright attachment times out (also reproduced with a 15-second timeout). No browser tests ran and no new visual verification is claimed. The owner was asked to reconnect Arc.
- Offline production DOM tests pass for the latest changes, including pointer cancel/release, keyboard bounds, green PASS, rich instruction formatting, exact JSON equality and hostile Markdown. Typecheck, Svelte check (zero warnings), 184 unit tests and three smoke tests pass.

## Limits

Older recordings lack the new contribution metadata. The UI labels that absence rather than recalculating historical decisions. Missing submitted questions remain unavailable, including injected judges that never called the SDK. Existing shared evidence and raw response views retain recorded redaction, omission and truncation markers.

No authentication changes, evaluator semantics changes or parent-wide completion is claimed. Node 22 was not separately tested.

## Rebase integration

Rebased onto `origin/main` at `3017c95`, retaining KVG-5170/5171/5172 behavior: two-second live polling, metadata-only archive indexing, project filtering, cursor pagination, deep links, failure states and writer capture-health notices. Lifecycle summary fields now come from the archive index. Failed assessments initially open the Response tab. UI regression coverage combines the debugger checks with upstream live discovery, delayed execution, reconnect, pagination, deep-link and failure-history checks. Browser verification remains blocked by the previously reported Arc CDP attachment issue.

Post-merge verification: 202 Bun tests, three smoke tests, production DOM/HTTP tests, TypeScript checks, Svelte checks (zero errors/warnings), and `git diff --check` all passed.

## Follow-up simplification and startup

The owner requested a quieter inspector UI. Capture status and recording identity now share one collapsed section. Gate identifiers and question version/reference metadata remain available behind labeled details controls. Repeated validated-status lines, no-gate row descriptions and the redundant dock snapshot label are omitted from the default view. Failure/incomplete states, lifecycle fields, confidence warnings, all distributions and Rich / JSON remain available. No recorded payload content was changed.

Standalone startup and Vite now prefer port 52320, with sequential fallback when occupied. The standalone listener retries up to 20 subsequent ports; its API remains strict by default for explicit-port callers. Regression coverage checks occupied-port fallback and preferred-port reuse.

After the owner reconnected Arc, all six Vitest/Playwright browser tests passed. A first combined desktop/mobile pass identified stretched probability rows and concatenated inert HTML examples; one fix batch aligned table rows, separated literal HTML blocks, shortened helper text and clarified finding counts. The confirmation pass passed with new captures in `.impeccable/review/playwright/`. Local browser-extension script requests are blocked but excluded from external-network assertions. Production DOM/HTTP tests, typecheck and Svelte check (zero errors/warnings) also pass. Earlier Arc-blocker entries above describe prior attempts, not the current state.

## Redesign finish status

The approved direction contract is `.impeccable/surfaces/inspector-src-app-svelte.md`, seed `5c4b72e9`, owner-selected Decision debugger, code-led.

Implementation, offline verification and the bounded Arc browser pass are complete. The design skill's independent finish review and final design-system documentation remain pending. The required `impeccable-finish-reviewer` and `impeccable-documenter` agents were absent from the executable-agent registry. No child was launched. The owner has been asked whether fresh generic delegates may substitute for these two roles. Do not treat this as a completed independent design finish gate until that is resolved.
