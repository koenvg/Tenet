## Why

TENET's Pi extension currently evaluates tools as soon as it loads. `observe` still calls TypeSafe and records potentially sensitive evidence, while changing `TENET_MODE` requires a new process. Before installing it across Pi projects, the owner needs an explicit, visible way to turn all TENET activity off and back on from Pi, including in other running Pi processes.

## What Changes

- Add owner-facing `/tenet status`, `/tenet on`, and `/tenet off` commands. Keep bare `/tenet` as the existing findings view.
- Share the on/off choice across Pi processes and projects on this machine. The issuing process cancels pending work before `/tenet off` returns; other processes cancel when they notice the change, without an acknowledgment barrier. New calls check the shared choice before assessment.
- In off state, leave the extension and commands loaded but skip evaluator calls, approvals, observation and new recording. On restores the process's existing `observe` or `enforce` mode and its normal unavailable-policy behavior. Show off explicitly in the owner UI.
- Document global Pi loading and the existing policy-path requirement for projects without `TENET.md`, plus the limits of a cooperative same-user toggle. Do not install it on the owner's machine as part of this planning change.

## Capabilities

### New Capabilities

- `global-tenet-control`: Owner commands, persistent machine-wide activation state, cross-process propagation, transitions, and off-state behavior for the Pi extension.

### Modified Capabilities

None. The existing observe/enforce choice remains fixed per process; activation is a separate override. The unarchived observe-mode and recording changes remain the source of their respective enabled-state behavior.

## Impact

Pi guard lifecycle, command registration, owner status and recording boundaries in `src/pi/`; a small owner-local control store; concurrency and smoke tests; Pi setup and privacy guidance in `README.md`. The independent decision engine, inspector, policy syntax and other coding-agent hosts do not change.
