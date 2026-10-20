# Toggle owner activation

Check native Pi owner commands and the shared control file without changing the owner's actual Tenet state. This developer-checkout recipe is offline.

## Sub-features

- `control-off` skips new assessment and capture while retaining earlier recordings.
- `control-on` resumes under the configured base mode.
- `control-status` distinguishes activation, mode, capture, and unsupported host coverage.
- `control-errors` reports unsafe or unwritable control state without claiming success.

## How to get to it (user POV)

- In Pi, use `/tenet status`, `/tenet off`, `/tenet on`, or bare `/tenet` for the findings view.
- In an owner shell, use `bun src/claude/cli.ts status`, `off`, or `on`. The shared choice works without the prototype bridge running.

## Driving it with Bun

Preconditions:

- Complete Launch with disposable process HOME and control paths. Turning off a real shared control affects other cooperating sessions.
- These checks must not use your actual `~/.tenet/control.json`.

- **Drive both entries.** Run `python3 -I .pi/skills/verify-tenet/scripts/run.py control --browser-cache "$CACHE" --evidence "$PROOF"`. It runs `test/global-control.test.ts` and `test/owner-cli.test.ts`.
- **Check native effects.** Require assertions for OFF/ON footer state, owner-only status, zero new judge requests and recordings while off. The selected tests do not independently prove retention of a pre-existing recording.
- **Check shell effects.** Require real CLI stdout, failures, and persisted `{ version: 1, activation: 'on' }` assertions. Status reports corrupt content as unavailable. An explicit on/off write can repair safe corrupt content. Unsafe files must not produce a success claim.
- **Retain proof.** Require exit zero, the command transcript, and scratch-removal confirmation.

## Gotchas

- Handler tests do not prove visible TUI keyboard behavior. Prototype bridge fixtures do not establish Claude host coverage.
- Activation is cooperative control, not isolation or sandboxing. Off skips guard work; it does not erase existing records.
- Native approval applies to one pending call. On does not grant approval or change base observe/enforce mode.
