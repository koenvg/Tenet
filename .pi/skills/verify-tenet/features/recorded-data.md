# Read exact recorded data

Inspect the recorded proposal, policy, questions, and submitted evidence without reading current source files or reassessing an action. This checkout recipe is offline and uses fictional records.

## Sub-features

- `data-action` lazily opens View recorded action.
- `data-exact` shows exact rule records and submitted evidence.
- `data-link` reopens the selected rule and action from a private link.
- `data-readonly` leaves archive bytes unchanged.

## How to get to it (user POV)

- Open a rule's Rule details panel, then expand View recorded action for a recorded check.
- Expand Recorded data, then Exact submitted evidence or Exact rule records and captured questions.
- Paste the selected address into another inspector tab. Browser back/forward is a separate navigation entry.

## Driving it with Playwright

Preconditions:

- Complete Launch and use the synthetic deployment-rule session from [session review](session-rules.md).
- Real recordings can contain source text and secrets even after redaction. Do not substitute owner records.

- **Drive the full path.** Run `python3 -I .pi/skills/verify-tenet/scripts/run.py proof --browser-cache "$CACHE" --evidence "$PROOF"`.
- **Open the action.** Use `page.locator('.rule-action-disclosure > summary').first().click()`, then wait for `.decision-summary`. The helper opens existing native disclosures through `openRecordedData(page, 'Questions')`.
- **Compare exact values.** Read `page.getByRole('region', { name: 'Exact rule records and captured questions', exact: true })`. Its JSON must equal the saved public detail response's questionVersion and rules, not today's templates.
- **Read evidence.** Call `openRecordedData(page)`. Require `Long exact recorded string.` and exact JSON equality between every displayed evidence field and the public detail response, with no missing or extra fields.
- **Reopen the link.** Open the current path and query in a second page. Compare submitted evidence with the original page. Keep the hashed session, rule, and invocation URL parameters unchanged.
- **Confirm identities.** Expand Recording and coverage, then Record identifiers. Require Recorded invocation ID, Recorded call ID, and Recorded session ID to equal the selected public detail response. Capture `reopened.png` and `reopened.aria.txt`.
- **Prove no writes.** Require equal archive hashes in `proof.json`, no nonlocal browser requests, and retained before/after ARIA snapshots, screenshots, and `detail.json`.
- **Cover history and polls when affected.** Run the existing panel journeys in `session-rules.pw.ts` using the clean-shell recipe linked from session review. Those separately cover Back/Forward and mounted exact data, focus, and scroll through polls.

## Gotchas

- The default proof covers direct-link reopening, not Back/Forward or every data disclosure.
- The default schema-1 seed has null captured questions. Equality proves those retained values, not non-empty question bodies. For question bodies use [recorded-data preview](../../../../inspector/tests/integration/recorded-data-preview.pw.ts); for current schema-5 scoped inputs use [scoped input journeys](../../../../inspector/tests/integration/scoped.pw.ts), with the same isolated browser-test setup.
- A submitted command is a proposal, not proof it executed. Permission, findings, and tool results remain separate.
- Missing, truncated, or historical data must remain explicit. Never rebuild old questions from current policy or interpret missing evidence as a pass.
