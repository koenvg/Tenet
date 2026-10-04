# Design

## Context

See [the proposal](proposal.md) for motivation and scope. This is a cross-module change because three entry points determine policy eligibility.

- `src/runtime/config.ts` validates blank overrides and resolves the selected policy path. `GuardRuntime.localPolicyEligible` treats any supplied override as eligible before loading that path. Pi and the SDK use this runtime.
- `src/claude/hook.ts` repeats the override eligibility check before contacting the bridge. Changing only the runtime would leave hook markers inconsistent with bridge sessions.
- `src/doctor/doctor.ts` independently resolves an override, checks eligibility, exposes `policy.selection` as `explicit` or `local`, and recommends the variable in error guidance.
- `test/session-policy-activation.test.ts` and `test/doctor.test.ts` require the old behavior. `test/observe-failures.test.ts` uses an explicit path to make an initially missing file unavailable rather than dormant.
- Main specs and pending `add-claude-code-integration` deltas require overrides. The new [activation delta](specs/session-policy-activation/spec.md) and [control delta](specs/global-tenet-control/spec.md) replace those requirements, not historical evidence.

## Goals / Non-Goals

**Goals:**

- Make runtime, hook, and diagnostic policy selection agree for the same project directory.
- Remove the environment setting rather than retain a compatibility branch.
- Preserve link-aware absence checks, session-generation rules, policy freshness, and mode-specific unavailable behavior.

**Non-Goals:**

- Do not change policy grammar, evaluator questions, integrity checks, host capabilities, approval behavior, or recording contracts.
- Do not add a replacement setting, parent search, global policy store, or automatic policy copy.
- Do not change which local symlinks the existing loader accepts. A broken local link must remain unavailable.
- Do not rewrite archived OpenSpec changes or recorded external policy sources.

## Decisions

### Ignore the removed variable

Remove reads of `TENET_POLICY` from executable source. Resolve configuration to `resolve(cwd, 'TENET.md')` and remove the blank-value validation. Stale values behave like any unknown environment variable and do not cause configuration errors.

Rejecting stale values would keep the variable part of the runtime contract and could break an otherwise valid local policy. A warning or compatibility switch would also keep an unnecessary branch. Neither is needed for this alpha change.

### Keep the existing local eligibility checks

Remove the early override checks in the runtime and Claude hook. Keep `lstat` of the local `TENET.md`: only `ENOENT` establishes new-session dormancy. Preserve read-error and broken-link handling, and do not change policy freshness checks or sticky Claude eligibility markers.

A file-presence shortcut that treats every error as absence could bypass enforcement. A broader eligibility-module refactor is not needed to remove this setting.

### Make doctor local-only without changing unrelated diagnosis

Resolve doctor's fallback path against its selected project. Check only that local file, report `policy.selection: 'local'`, and narrow the report type to the supported value. Remove override guidance and override-related configuration failures. Keep other report fields, output formats, redaction, offline limits, and state precedence unchanged. In particular, off remains distinct from dormant and other invalid prerequisites can still make a no-policy project invalid.

There is no new report field or versioned assessment contract. Older archived source paths retain their recorded meaning.

### Replace override fixtures with local failure fixtures

First add failing tests for local selection despite a stale override, no-policy dormancy despite an external file, and harmless blank values. Use distinct local and external policy contents so source, digest, rule count, and submitted rules can prove which file was used.

Replace the explicit-missing fixture in `test/observe-failures.test.ts` with a present local broken link, or another local read failure before session start. Keep deletion-after-activation tests as a separate lifecycle case. Do not simply remove unavailable-policy coverage when deleting override tests.

### Update maintained instructions, not historical records

Remove the variable from supported settings tables and ordinary setup steps. Put a short removal warning and migration steps in the policy guide, then link to it where needed. Update archive, doctor, SDK, Claude, developer, and website wording and its copy tests. Keep disclosure and host-coverage warnings intact.

Do not edit other pending change folders as part of this proposal. During implementation, identify conflicting pending deltas for archive ordering; they must be reconciled before they can restore override behavior to the main specs.

## Risks / Trade-offs

- [Override-only projects become dormant, including enforce mode] → Require an owner-reviewed local policy before restarting; verify native status before authorized live work. Do not claim enforce activates a project without a policy.
- [Hook and bridge disagree] → Add offline Claude tests with a stale override in both environments and verify new local-absent markers stay dormant. Preserve restart and missing-state safety tests.
- [Unavailable-policy tests lose coverage] → Replace override-driven fixtures with local failures and keep stale-policy lifecycle cases in both modes.
- [Old pending deltas restore removed behavior] → Record the conflict and check archive order before merging their requirements into the main specs.
- [Broad documentation edits lose safety limits] → Follow the writing guide and manually check all 18 items on each changed maintained page.

## Migration Plan

1. Tell owners that `TENET_POLICY` has no effect in the new version. An override-only project no longer receives assessments or enforcement.
2. Have the owner review and place the intended policy at each session working directory's `TENET.md`, outside the guarded agent's intercepted path. Remove the obsolete environment setting. Tenet must not copy or create policy automatically.
3. Build and verify offline, then restart the installed host process. Doctor uses `--project`; native status verifies session readiness. Neither offline tests nor doctor prove live provider connectivity or complete host coverage.
4. Rollback, if required, means restoring the prior code or delivery artifact and restarting the host. Restoring only `TENET_POLICY` on the new version does not restore override support. Do not delete or rewrite existing recordings.
