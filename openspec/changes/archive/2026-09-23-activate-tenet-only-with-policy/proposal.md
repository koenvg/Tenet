## Why

A globally loaded TENET extension currently treats an absent `TENET.md` as an unavailable policy. It still displays TENET UI and creates records, and `TENET_MODE=enforce` blocks calls in projects that never opted in. Global loading should be quiet outside projects with a policy without turning a broken policy into an enforcement bypass.

## What Changes

- **BREAKING**: With no local `TENET.md` and no `TENET_POLICY` override, the Pi guard is dormant for that session. It does not assess, veto, capture, create records, or show TENET UI.
- A local `TENET.md` or an explicitly configured `TENET_POLICY` activates the guard. An explicit path remains eligible even when the target is missing or invalid. Never use the policy bundled with the plugin as a fallback.
- A present but unreadable, malformed, or otherwise unusable policy remains unavailable under the existing mode-specific behavior: block in enforce, permit in observe. Changes or disappearance after activation must not silently put the session to sleep.
- Update global control requirements and setup guidance so the dormant state is distinct from OFF and from policy/control unavailability. Add offline and Pi-session tests for both modes and for a directory without a policy before any global rollout.

## Capabilities

### New Capabilities

- `session-policy-activation`: Selects dormant versus policy-eligible Pi sessions and preserves conservative behavior for broken or changing policies.

### Modified Capabilities

- `global-tenet-control`: Clarifies how global on/off commands, status, and setup instructions behave in a dormant session versus an eligible one.

## Impact

The Pi extension's session startup, policy selection, event handling, owner UI, recording, tests, and README setup instructions change. The policy evaluator and standalone inspector do not need new behavior. No global Pi installation is part of this proposal.
