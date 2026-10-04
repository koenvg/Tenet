# Proposal

## Why

Owners need one personal policy that applies across projects without copying rules or selecting a different file for each session. Tenet currently selects one project or explicit policy, so it cannot apply personal rules alongside project rules.

## What Changes

- Automatically discover the optional global policy at `~/.tenet/TENET.md`, using the owner's home directory, independently of the agent host.
- Combine global rules with the session directory's `TENET.md`. `TENET_POLICY` selects an alternative project policy only; it never replaces the global policy.
- Evaluate every declaration independently. Project permissions, exceptions, severities, and threshold settings cannot remove or weaken a global declaration.
- **BREAKING**: A global policy makes sessions eligible without a project policy. An invalid global policy makes assessment unavailable even when the project policy is valid. With neither implicit file and no explicit override, sessions remain dormant.
- Protect both policy sources and resolved targets, retain conservative freshness checks, and reject invalid or over-limit combinations without partial enforcement.
- Identify each rule's global or project origin in current status, recordings, doctor output, and inspector findings. Keep historical records interpretable under their recorded contracts.
- Use the same policy selection in the SDK, Pi, doctor, and the existing Claude Code prototype. This does not add host coverage or certify the prototype.

## Capabilities

### New Capabilities

None. Extend the existing policy capabilities rather than add a parallel global-policy system.

### Modified Capabilities

- `session-policy-activation`: Discover global and project candidates together, select an eligible source set, and retain dormant versus unavailable behavior.
- `configurable-policy-enforcement`: Compose immutable policies with independent rules, source-qualified identities, bounded limits, freshness checks, and integrity protection for every source.
- `global-tenet-control`: Update Pi eligibility and setup guidance to account for global policies while keeping the existing cooperative on/off behavior.

## Impact

- Policy selection and loading: `src/runtime/config.ts`, `src/runtime/guard.ts`, `src/decision/policy.ts`, and policy contracts.
- Evidence, integrity, questions, freshness checks, and diagnostics must consume a source set rather than a single source.
- Public SDK readiness and finding types, Pi status, doctor diagnostics, recording contracts, inspector readers, and BB archive consumers need source-aware handling. Current API shapes can change in alpha; historical records must not be rewritten or interpreted through current policies.
- The Claude hook's startup eligibility check must match the shared runtime so global-only sessions do not bypass the bridge.
- Update maintained policy, configuration, SDK, doctor, and installation guides. Do not change historical handoffs, archived OpenSpec changes, sample policies, or the owner's global file.
- Add offline tests using temporary home directories and injected judges. No new dependency, live provider call, installation change, or policy-management command is required.
