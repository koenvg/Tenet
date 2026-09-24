# Tasks

## 1. Runtime contract and Pi preservation

- [x] 1.1 Add test-first shared contract cases using scripted judges for ALLOW/ASK/BLOCK, WARN, observe, unavailable, dormant, policy freshness and missing approval; verify cases reproduce current Pi outcomes before extraction and document the public runtime inputs/results.
- [x] 1.2 Extract host-neutral configuration, eligibility, assessment/consequence and pending invocation ownership from `src/pi/guard.ts` behind the runtime interface; verify shared contract tests and an import check that runtime modules require no Pi package or interactive UI.
- [x] 1.3 Move invocation-bound approval validity, cancellation and generation handling into shared runtime ownership while retaining Pi's native approval callback; verify `approval-lifecycle`, duplicate-ID, changed-argument, late-response and cross-context isolation tests.
- [x] 1.4 Adapt Pi hooks, native transcript recovery, owner reports, commands and inspector launch to the runtime; verify existing Pi, observe, owner-reporting, trajectory, session-policy-activation and pinned Pi smoke suites without changing expected behavior.
- [x] 1.5 Add adapter identity/capability status and a headless embedded caller fixture; verify equivalent evidence yields equivalent would-decisions and unsupported approval yields blocked permission without a UI dependency, and document capability meanings.

## 2. Cross-host archives and inspector

- [ ] 2.1 Introduce a host-qualified versioned recording envelope and dual-version reader; verify schema-1 fixtures still load without rewriting files and unsupported versions remain visible as issues.
- [ ] 2.2 Update archive/index identity and inspector selection for host and execution context; verify equal native IDs across hosts/subagents remain separate and legacy Pi links still resolve.
- [ ] 2.3 Show recorded host and coverage limitations alongside distinct decision, permission and execution state; verify inspector tests cover missing results, historical thresholds and mixed-version archives, and document the archive compatibility/rollback limits.
- [ ] 2.4 Apply existing privacy and capture controls to the new runtime path; verify dormant/off/recording-disabled cases create no diagnostic evidence, capture failure does not change permission, and inspector endpoints remain read-only.

## 3. Private bridge and shared owner control

- [ ] 3.1 Implement the versioned local bridge with owner-only socket/state paths, bounded framing, request deadlines and session limits; verify process tests for unsafe paths, malformed/oversized input, protocol mismatch, disconnect and resource exhaustion.
- [ ] 3.2 Implement minimal eligibility/generation state and explicit lifecycle/restart handling without storing disabled-capture action payloads; verify policy deletion never becomes dormancy, lost state is unavailable, restart cannot release old work and unknown results remain unknown.
- [ ] 3.3 Reuse shared activation in Pi and the bridge and add owner CLI status/on/off; verify cross-process off propagation, pending cancellation, corrupt control, idempotency, stopped-bridge commands and unchanged Pi command behavior.
- [ ] 3.4 Document explicit bridge startup/shutdown, control scope, status meanings and private-path requirements; verify documented commands in temporary directories with no changes to owner settings.

## 4. Claude Code adapter

- [ ] 4.1 Define documented hook fixtures and event mapping for session, turn, subagent, pre-tool and successful/failed result events; verify built-in/MCP calls share the same path, identities remain isolated, missing metadata is disclosed and arbitrary transcript paths are never read.
- [ ] 4.2 Implement the synchronous command-hook client and mode-aware local failure path; verify eligible enforce bridge failures produce valid denial before the outer hook timeout, observe never vetoes, and trusted dormant/off states bypass without a bridge.
- [ ] 4.3 Map runtime outcomes to Claude protocol without allow overrides, input mutation or native-ask approval; verify BLOCK/unavailable/ASK deny, ALLOW leaves native permissions intact and stdout contains only valid protocol output.
- [ ] 4.4 Add privacy tests for observe reporting and denial reasons; verify observation findings never reach agent-consumed stdout/stderr/context and denial messages omit arguments and provider prose.
- [ ] 4.5 Supply opt-in catch-all hook configuration and package entry points plus install/removal documentation; verify configuration in isolated settings, confirm no tool filters or async pre-tool hooks, and document initial macOS/Linux CLI scope and unsupported approval.

## 5. Claude host verification and support profile

- [ ] 5.1 Pin a Claude Code version and capture its actual hook behavior using isolated settings, harmless local tools and scripted TENET judgments; verify denial prevents executor effects and ALLOW does not bypass native restrictions. Record the exact version/configuration and mark host verification blocked if a suitable host cannot be exercised.
- [ ] 5.2 Exercise actual-host successful/failed result correlation, parallel calls, subagent identity and session resume/clear/compaction/end; verify mappings against executor observations and record missing-event limitations rather than inferring execution.
- [ ] 5.3 Exercise actual-host argument-mutating parallel hooks, stopped bridge, hook nonzero exit, process kill and host timeout; verify handled failures deny where specified and publish actual fail-open gaps plus the supported non-mutating profile.
- [ ] 5.4 Add coverage status for unknown versions and unsupported configurations and finalize setup/troubleshooting documentation; verify status never equates enforce configuration with certified coverage and documentation distinguishes protocol tests from actual-host verification.

## 6. Cross-host integration gates

- [ ] 6.1 Run the full offline suite, `bun run typecheck`, `bun run smoke`, `bun run inspector:check` and `bun run inspector:test`; verify no Pi regression and record commands/results without using live judge calls.
- [ ] 6.2 Run a combined Pi/Claude bridge workflow against a mixed archive with shared off/on, equal native IDs, restart and recording opt-out; verify independent evidence, shared activation behavior, unchanged Pi approval and blocked Claude ASK.
- [ ] 6.3 Validate OpenSpec artifacts and compare every capability scenario against delivered test or host-verification evidence; report incomplete host gates explicitly and do not mark Claude enforcement support verified while those gates are missing.
