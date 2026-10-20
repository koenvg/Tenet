# Check local readiness

Use the owner doctor command to distinguish local readiness, invalid settings, unavailable prerequisites, and bypass states in a developer checkout. This recipe is offline.

## Sub-features

- `doctor-output` exposes policy identity and readiness without secret text.
- `doctor-readonly` leaves inspected files unchanged and makes no provider request.
- `doctor-config` honors the selected project settings and reports invalid sources.

## How to get to it (user POV)

- Checkout owners build the SDK, then run `node dist/cli/index.js doctor --project "$PWD"` from the repository root. Use the compiled CLI, not `src/cli/index.ts`.
- Add `--json` for the machine-readable report.
- Archive owners use `node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD"`. This map tests checkout fixtures, not an owner's installation.

## Driving it with Bun

Preconditions:

- Complete Launch and use disposable fixtures, never the checkout's policy or personal HOME for a readiness experiment.
- Read [doctor usage](../../../../docs/doctor.md) for exit meanings before interpreting results.

- **Run both output forms.** Run `python3 -I .pi/skills/verify-tenet/scripts/run.py preflight --browser-cache "$CACHE" --evidence "$PROOF"`. It builds the SDK and runs `test/doctor.test.ts`, including real CLI invocation, JSON, and text output.
- **Check proof.** Require exit zero and inspect `commands.log` for readiness, policy identity, no-secret, zero-network, and unchanged-tree assertions. Require `run.json` to confirm scratch removal.

## Gotchas

- `ready` proves local prerequisites only. Credential presence is not validity or connectivity.
- `off` and `dormant` are bypass states, not passing assessments.
- Test fixtures author their own policy and fake credential markers. Never supply a real key.
