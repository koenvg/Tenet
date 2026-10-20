# Review session rules

Browse recorded session findings in Tenet's real read-only inspector. This developer-checkout recipe uses fictional archives and disposable Playwright Chromium.

## Sub-features

- `session-picker` switches among violation, clear, unclear, and unchecked sessions.
- `rule-open` opens a rule with its recorded finding and checks.
- `rule-pages` loads later recorded checks.
- `rule-close` returns keyboard focus to the opening rule.

## How to get to it (user POV)

- Open the standalone inspector URL. In an eligible installed Pi session, `/tenet-inspector` starts the reader and tries to open its session URL in Arc on macOS. It prints the URL if Arc cannot open. This entry reads the installation's archive and is not authorized by the offline recipe. Checkout development uses `bun run inspector` or built assets with `bun run inspector:serve`.
- Open the native Session picker and choose a session.
- Choose a rule under Rules in this session, or reopen its private address-bar link.
- Choose More recorded checks inside Rule details.

## Driving it with Playwright

Preconditions:

- Complete Launch. Its seed provides four sessions and 55 checks for the deployment rule in the violation session.
- Use only the run-owned loopback URL. The inspector is unauthenticated; never expose or proxy it.

- **Run the browser proof.** Run `python3 -I .pi/skills/verify-tenet/scripts/run.py proof --browser-cache "$CACHE" --evidence "$PROOF"`. Its doctor checks all four session states.
- **Open a rule.** The helper runs `page.getByRole('button', { name: /Ask for approval before deploying to production/ }).click()`. Expect the Rule details dialog, Violation found, and 50 `.rule-check` rows.
- **Load more.** Use `page.getByRole('button', { name: 'More recorded checks' }).click()`. Expect 55 rows without changing the selected rule.
- **Close.** Press Escape or choose the exact Close button. Expect no open dialog and focus on the opening rule.
- **Cover other entries when affected.** In the same fixture, click `.rule-session-toggle`, then select `input[value="${sessionKey(session)}"]`. The existing `inspector/tests/integration/session-rules.pw.ts` native-picker journey covers pointer, ArrowDown, Escape, and outside dismissal. Its panel journeys cover 1280px, 390px, and 320px widths, Close, outside dismissal, and browser history. Run them in the clean shell from the [test guide](../../../../inspector/tests/README.md), using `bun x playwright test --config inspector/playwright.config.ts inspector/tests/integration/session-rules.pw.ts`.

## Gotchas

- The default proof visits the deployment rule and its direct link. It does not drive every picker state, viewport, Close button, Pi launch menu, or history entry.
- A recorded violation is not proof of blocked permission or execution. These historical seed actions never run.
- Build and restart after reader changes. Rebuilding alone leaves an old reader running.
