## Context

See `proposal.md` for the problem. `src/pi/guard.ts` currently creates activation, archive, reporting, and event handlers when the extension loads. Its `session_start` always calls `readConfig` and `loadPolicy`; an absent local file becomes `policy-unavailable`. `tool_call` creates an invocation and records a decision even when the policy cannot load. `OwnerReports.register` runs before session startup, and startup sets footer and capture status. `loadPolicy` groups filesystem failures under one unavailable reason, so eligibility cannot be inferred from its result.

Pi reloads extension instances for replacement sessions. The current test harness always creates `TENET.md`; it needs a no-policy variant. See the two delta specs for required outcomes.

## Goals / Non-Goals

**Goals:** Keep absent-local-policy detection separate from policy validation. Prevent every TENET side effect in dormant sessions while preserving the current conservative path in eligible sessions.

**Non-Goals:** Install TENET into the owner's global Pi configuration, alter the TypeSafe evaluator, read prompt attachments as policies, or make TENET an OS-level security control.

## Decisions

1. Resolve eligibility once at `session_start`, before config parsing, policy loading, shared-control watching, record writes, or TENET UI. An explicitly supplied `TENET_POLICY`, including an empty value, is eligible; `readConfig` then rejects an empty value. Without it, inspect only `ctx.cwd/TENET.md` with a link-aware existence check. Only a definite `ENOENT` of that path makes the session dormant. A broken symlink, permission error, or other uncertainty enters the eligible unavailable path. Keep this check distinct from `loadPolicy`, which continues to report validation failures. Alternative rejected: use `loadPolicy(...).available` as the activation test; it conflates missing and malformed files.

2. Represent dormant as session-local eligibility, not as a value in the persistent on/off store. Short-circuit `tool_call` and `tool_result` before any invocation identity, archive bind, record, evaluator or control refresh; avoid startup recording and watcher work in dormant sessions. Lifecycle cleanup still runs, but does not emit TENET UI or evidence. Eligible sessions retain current control, stale-policy, and in-flight cancellation paths. Guard the time before session initialization conservatively rather than treating an unknown state as dormant. Alternative rejected: call `/tenet off` implicitly, which would persist a machine-wide choice and affect other projects.

3. Register owner commands only for eligible sessions, after eligibility is established; do not set footer, capture status, or notify in dormant sessions. Check the pinned Pi runtime's dynamic command registration behavior in the Pi-session smoke test. Pi reloads extensions on session replacement, so the next session gets a fresh eligibility decision and command list. A policy appearing in a dormant working directory requires a new session or extension reload; a policy disappearing from an eligible session stays unavailable/stale until reload rather than silently disabling enforcement. Alternative rejected: register `/tenet` globally and answer it in dormant sessions; that still exposes TENET UI where none was requested.

## Risks / Trade-offs

- [Existence-check race] A file can change between eligibility selection and policy load. The eligible path stays conservative if loading fails; a newly created file after a confirmed absence waits until a new session or reload. Test both cases.
- [Pi command registration timing] If commands registered at `session_start` do not show in Pi's command list, the UI contract needs an alternative Pi-supported registration mechanism. Verify with the pinned host before rollout; do not leave a visible dormant command.
- [Existing missing-policy tests] Tests that previously classified every missing file as unavailable need to distinguish default local absence from explicit missing paths. Retain the latter as an enforce-mode block.

## Migration Plan

1. Add offline regression coverage and a pinned Pi-session smoke case before global installation. Verify observe and enforce in a directory without `TENET.md`, then local valid, malformed, unreadable, and explicit missing policies.
2. Update README instructions: global loading alone leaves unconfigured projects dormant; an explicit absolute path enables those projects, including unavailable behavior if that path breaks. Keep manual install and removal steps. Do not change this machine's global Pi package list as part of implementation.
3. For rollout, first trial a policy-free Pi session with the package loaded but without live credential-dependent calls; then trial an eligible session and confirm `/tenet status`. Rolling back requires unloading or restoring the previous extension code and restarting Pi; the old version blocks in enforce mode for a missing policy.
