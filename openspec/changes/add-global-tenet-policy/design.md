# Design

## Context

See [the proposal](proposal.md) for the owner goal. The confirmed choices are the global location, additive rules, and `TENET_POLICY` selecting only the project source.

The current `PolicySet` in `src/decision/contracts.ts` has one source, target, digest, and rule list. `loadPolicy` in `src/decision/policy.ts` validates immutable snapshots with limits of 64 KiB, 16 declarations, and 4096 bytes per rule text. Rule IDs are currently file digest plus physical line. Freshness checks compare one resolved target and digest.

Selection is repeated in the runtime, doctor, and Claude hook. Pi, SDK readiness, evidence, archives, and inspector code expose or consume single-source metadata. The current activation specification explicitly excludes global discovery, so this change replaces that selection contract. The existing generic independent-rule contract already supplies the required conflict behavior.

## Goals / Non-Goals

**Goals:**

- Keep one shared selection and composition contract across existing consumers.
- Freeze one complete, bounded snapshot for each assessment and permission lifecycle.
- Preserve recorded source meaning and effective thresholds when current policies change.
- Keep policy tests isolated from the owner's real home and policy files.

**Non-Goals:**

- Parent-directory inheritance, host-specific policy locations, a global-path override, or per-project opt-out from global rules.
- Policy editing commands, automatic policy creation, rule replacement, or semantic conflict resolution.
- New host integrations, live evaluator accuracy work, OS isolation, or changes to the on/off control.
- A compatibility layer for old current SDK shapes. Historical decoding is required, current alpha APIs can change.

## Decisions

### 1. Use a shared two-candidate selector

Resolve the global path with the same owner-home mechanism used by `src/runtime/activation.ts`, then select the project candidate from the override or session cwd. Keep the global candidate first. Represent each candidate with role, source path, selection kind, and confirmed presence or failure. Absence is optional only for implicit candidates and only after a confirmed `ENOENT`; broken links and other filesystem errors remain unavailable.

Use this selector for runtime startup, doctor, and Claude hook eligibility. The hook uses selection for eligibility, not a separate parser or evaluator. Each process uses its own resolved owner home; a hook/bridge owner mismatch must not manufacture readiness. Test home resolution through an internal dependency or isolated child environment, not a new public global-policy override.

Alternative: copy the global file check into each consumer. Reject this because startup disagreement can bypass a global-only policy. Host-specific locations would duplicate personal configuration.

### 2. Replace the single-source snapshot with a source set

Keep a bounded ordered candidate list and validated source snapshots. Each source snapshot records role, configured source path, resolved target, file digest, byte count, and declarations. The effective policy exposes the combined rule list for the existing evaluator. Do not put a synthetic merged file on disk or concatenate files before parsing; source lines and failure attribution must remain accurate.

Validate each present file, then apply the existing limits to the complete set: 64 KiB of file bytes, 16 user declarations, and 4096 bytes per rule text. Exactly two roles bound discovery. An invalid source invalidates the complete set. A present file without declarations remains invalid under the current grammar. Optional absence is not an empty parsed policy.

Alternative: allow 16 rules per source or silently drop invalid global rules. Reject both because they change evaluator resource limits or weaken enforcement. Increasing limits can be a separate change.

### 3. Keep source-qualified identities and deterministic composition

Use role, file digest, and physical line to identify each declaration, for example `global:<digest>:<line>` and `project:<digest>:<line>`. Keep declaration order global first, then project, and physical line order within each file. Identical declarations remain separate. If both roles resolve to the same file, retain both occurrences and count both toward limits; require consistent snapshots of that shared target.

Create a versioned combined digest from an unambiguous encoding of ordered candidate roles, source paths, presence states, and validated target/digest metadata. A change to either source or candidate presence changes the effective snapshot identity. Current rules retain individual source digests for attribution; findings do not use the combined digest as a substitute for origin.

Alternative: keep digest-plus-line IDs across files or deduplicate equal text. Reject the first because identical files collide, and the second because declarations can differ in severity or threshold. Path-based rule IDs alone would not identify content versions.

### 4. Keep independent decisions and one integrity assessment

Feed the combined rule list to the existing generic evaluator and aggregation logic. Do not introduce precedence or a project override step. Source metadata is evidence for attribution and integrity, not instructions that change a rule's meaning. Preserve BLOCK/WARN, per-rule evidence thresholds, global outcome thresholds, applicability fact requirements, and invocation-local approval.

Use one built-in integrity assessment that sees all selected source paths and resolved targets. Include absent selected candidates as protected paths in eligible sessions so agent creation or redirection cannot change the active selection. Integrity keeps its global configured evidence threshold and no approval exception. Update integrity evidence and its versioned question contract where necessary; do not add domain-specific evaluator branches.

Alternative: one integrity assessment per file. Reject this because the invariant is protection of the complete selected set, not a different permission system for each file.

### 5. Invalidate the complete source set on changes

Check every loaded source's digest and resolved target, and confirm that absent candidates remain absent. Apply checks at the existing assessment and permission-release boundaries, including after approval. A change, deletion, unreadable source, retargeted link, or newly present candidate invalidates the complete snapshot. Observe retains its unassessed/cancelled behavior; enforce blocks rather than using the valid subset.

A dormant session remains dormant until the next session start or extension reload. An active session does not hot-add rules or become dormant. Reload reselects and validates the entire set. Off continues to bypass assessment and capture; re-enabling does not make a stale policy valid.

Alternative: silently freeze the earlier source set when a new global file appears. Reject this because the owner would expect the new global policy to apply while the session ignores it. Continuous automatic reload would change approval and generation semantics beyond this task.

### 6. Record source provenance at the assessment boundary

Update current policy, SDK readiness/finding, doctor, and owner status shapes to use source lists and the combined digest. Capture source role, configured path, resolved target, digest, line mapping, and effective thresholds with the frozen assessment snapshot. Use bounded, sanitized paths in diagnostic output; do not add policy text or action strings to safe diagnostic logs.

Audit evidence encoders, archive validators, replay, inspector parsing/display, Pi reports, and BB archive readers for single-source assumptions. Version changed contracts and route historical decoding by the recorded version. Older records retain their original source and IDs with unknown role where no role was recorded. New views never read today's policy to reconstruct a historical assessment. Keep exact submitted evidence under existing recording and disclosure controls.

Alternative: keep a misleading singular source field or reinterpret older records as project policies. Reject these because they hide the global source or invent historical facts. Do not create parallel current-format models to preserve alpha API shapes.

## Risks / Trade-offs

- A global file activates more projects and can make all eligible sessions unavailable. Mitigate with source-specific doctor/status output and an owner warning before creating or changing the global file.
- Two files share the existing resource budget, so previously valid project files can exceed the combined limit. Report exact limit failures and document the total budget; never truncate global rules.
- A normal test process could read personal rules. Use disposable owner-home fixtures for all policy discovery tests, including archive verification and SDK subprocesses.
- Global rule text can reach TypeSafe and local recordings whenever eligible sessions assess actions. Preserve the existing disclosure and capture warnings and do not copy personal rules into fixtures.
- Freshness and integrity remain cooperative host checks, not atomic filesystem enforcement or an OS security boundary. Retain host interception and argument-stability limits.
- Other pending changes modify Claude control and BB reporting. Apply source-aware updates to the existing code without treating pending plans as implemented or expanding their host guarantees.

## Migration Plan

1. Add isolated-home regression tests before replacing current selection and policy contracts.
2. Update the shared policy model, all current consumers, and version-aware historical readers together. No stored archive rewrite is needed.
3. Update maintained guides and verify the relocated delivery archive discovers the owner's policy, not an installation policy.
4. Do not create `~/.tenet/TENET.md` for the owner. After deployment, the owner authors it outside the intercepted path, reviews both source sets, restarts or reloads sessions, and checks doctor and native status before live calls.
5. Warn before rollback: an older Tenet release will ignore automatic global discovery and cannot reproduce additive enforcement. Roll back only with an owner-reviewed complete policy explicitly selected for each affected session, or keep the new version. Historical readers must retain recorded contract support.
