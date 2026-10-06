# Proposal

## Why

The BB Tenet page only lists flagged rules and provides no session or call overview. Owners need the inspector's summary layout inside BB so they can see passing calls, uncertainty, evaluator failures and recording gaps without leaving their thread.

## What Changes

- Replace the empty Tenet sidebar landing page with a project and Pi-thread picker, linked-session summaries and a paginated call timeline.
- Add a read-only Tenet overview tab beside the thread. Keep the quiet header action and selected-FAIL indicator, with an action that opens the overview without leaving the conversation.
- Reuse the inspector's summary, call-list and rule-summary presentation in both applications. Use BB's authenticated host connection, not an iframe or a proxy to the standalone listener.
- Show recorded assessment state separately from findings, permission and execution. Include a clear evaluator-unavailable state instead of treating provider failures only as unfinished recordings.
- Keep raw arguments, submitted evidence, provider responses and exact question payloads in the standalone inspector. BB receives only bounded, allowlisted summaries and recorded rule text.
- Preserve exact thread/host association, custom archive settings, historical contract interpretation, honest unknown coverage and the standalone inspector's existing behavior.

## Capabilities

### New Capabilities

- `bb-tenet-overview`: Read-only project, thread, session and call summaries inside BB, using shared inspector presentation and host-local archive reads.

### Modified Capabilities

None. The durable Pi inspector-launch, policy-activation and enforcement requirements remain unchanged. This builds on the implemented plugin described by the still-open `add-bb-pi-thread-rule-status` change; it does not duplicate or rewrite that change's artifacts.

## Impact

The affected code is `bb-plugin-tenet-status/`, the summary projection and exact-link readers in `src/inspector/`, and the inspector summary views, navigation and build tooling in `inspector/`. The BB owner/host RPC contracts gain bounded summary operations; the plugin build gains a shared Svelte summary entry mounted through its React registration.

Coordinate the existing recorded evaluator-state result contract with the shared summary work instead of introducing a second classification implementation. Fixing the live TypeSafe provider error, changing policy or enforcement, exposing raw evidence in BB, and adding support for non-Pi BB threads are outside this change.
