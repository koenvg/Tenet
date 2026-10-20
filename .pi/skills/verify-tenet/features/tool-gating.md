# Check Pi tool-call gating

Verify that Tenet permits, withholds, or requests approval for a pending Pi tool call. This checkout recipe uses the real pinned Pi dispatch with scripted model and judge responses.

## Sub-features

- `guard-dispatch` covers built-in, extension, dynamically registered, and nested tools.
- `guard-approval` releases one approved call whose identity and arguments are unchanged at Tenet's hook-release boundary.
- `guard-unavailable` withholds calls on provider failure and uncertain outcomes in enforce mode.
- `guard-cancel` revokes pending consent on cancellation and lifecycle changes.

## How to get to it (user POV)

- A Pi agent proposes a tool call under the selected policy.
- When enforce mode requests approval, the owner accepts or declines the native TENET confirmation.
- A nested orchestrator dispatches a child tool through the same Pi hook boundary.

## Driving it with Bun

Preconditions:

- Complete Launch. Use the pinned Pi 1.3.0 dependency and disposable process HOME.
- No live API key or personal policy is present.

- **Drive dispatch and consent.** Run `python3 -I .pi/skills/verify-tenet/scripts/run.py guard --browser-cache "$CACHE" --evidence "$PROOF"`. The existing `test/pi-smoke.test.ts` loads Pi, drives proposed calls, resolves native consent, and checks executor invocation counts and arguments.
- **Prove effects.** Require exit zero and the smoke assertions in `commands.log`. Denied approval, integrity failures, provider failures, changed arguments, and cancelled consent must not increment executor counts. An approved unchanged call executes once.
- **Check provenance.** Native permission and execution records remain distinct. Pi's missing exact result correlation keeps execution unknown even after a successful dummy executor.

## Gotchas

- This is a programmatic AgentSession integration run. It does not record the visible TUI dialog or prove deployed owner hooks.
- Pi does not freeze arguments after Tenet releases the hook. Another extension's later mutation is outside this proof. Overlapping approval cases use direct hook events, not proof of AgentSession's concurrent scheduling.
- The focused helper does not run `test/approval-lifecycle.test.ts`. Use the canonical offline lane for deeper approval deadlines, queued mutation, and policy-change revocation checks.
- Dummy executor and judge scripts are explicit offline boundaries. They do not prove evaluator accuracy or real publication.
- Observe is the default and never blocks. This recipe explicitly tests enforce fixtures; do not change a running owner's mode.
