# Proposal

## Why

`TENET_POLICY` lets an inherited environment value select a policy outside the current project. Remove that override so session policy selection has one rule: use `TENET.md` in the session working directory.

## What Changes

- **BREAKING**: Remove support for `TENET_POLICY`. Absolute, relative, missing, empty, and whitespace-only values have no effect on policy selection, eligibility, or configuration validity.
- Use only the session working directory's `TENET.md` in the shared runtime, Pi adapter, Claude hook eligibility check, and doctor. Doctor uses the directory selected by `--project`.
- Keep confirmed local absence dormant in both modes. Keep a present unusable policy unavailable, and never turn an eligible session dormant after policy deletion.
- Keep no parent search, no installation fallback, and no activation from prompt attachments. Do not add another override mechanism.
- Report local selection in doctor and remove instructions that recommend external policy selection from maintained guides and the website. Preserve historical records.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-policy-activation`: Require local-only policy selection across runtime-backed sessions and offline doctor checks, regardless of `TENET_POLICY` values. Preserve dormant and unavailable behavior.
- `global-tenet-control`: Update Pi eligibility and global-install guidance to require each project's local policy, while preserving control and safety limits.

## Impact

- Runtime code: `src/runtime/config.ts`, `src/runtime/guard.ts`, `src/claude/hook.ts`, and `src/doctor/doctor.ts`. The compiled SDK and CLI inherit the shared runtime change.
- Tests: policy activation, runtime and SDK contracts, Claude integration, doctor, unavailable-policy fixtures, and marketing copy checks. Tests use injected judges and temporary local files, not TypeSafe.
- Documentation: `README.md`, `CONTRIBUTING.md`, policy/configuration/doctor guides, archive guides, SDK/shared-runtime/Claude guides, and `site/docs.html`.
- Owner action: Put a reviewed policy at each session directory's `TENET.md` and restart the host. A project that relied only on the override becomes dormant, including in enforce mode; enforce does not activate a project without a local policy.
- Existing main specs and the pending `add-claude-code-integration` deltas explicitly require the override. This change replaces that behavior. Its local-only requirements must not be overwritten when older pending changes are archived.
- No new dependency, evaluator question change, recording format change, or host coverage claim is required.
