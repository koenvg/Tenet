# Proposal

## Why

Tenet currently integrates only with Pi, although its decision function already accepts host-neutral actions and an injected judge. A shared runtime plus a Claude Code adapter will make policy behavior reusable across laptop agents and future unattended applications without copying Pi-specific enforcement logic.

## What Changes

- Extract session and invocation enforcement into a host-neutral, embeddable runtime. Keep Pi hooks, transcript translation and owner UI in the Pi adapter.
- Introduce explicit adapter capabilities and coverage limitations for interception, results, lifecycle, argument stability and trusted approval.
- Add a Claude Code command-hook adapter and a private local bridge using the same runtime. Cover interactive and headless CLI tool events, including identifiable subagent calls, subject to a tested host version and configuration.
- Preserve observe as the default. In enforce mode, deny BLOCK and deny ASK when trusted invocation-specific approval is unavailable. A Tenet pass never overrides Claude Code's own permissions.
- Retain Jev as the only production judge. Host integrations and evaluator implementations remain independent concepts.
- Add host-qualified recording identity and inspector presentation without losing historical Pi archives.
- Extend the existing cooperative machine-wide activation choice to Claude Code, with an owner-facing CLI for control and status. Preserve Pi commands and their behavior.
- Document hook crash, timeout, disabled-hook and argument-mutation gaps rather than claiming sandbox-level protection.

## Capabilities

### New Capabilities

- `host-neutral-guard-runtime`: Shared session/invocation behavior, capability reporting, scoped identities and approval semantics for embedded and bridged adapters.
- `claude-code-integration`: Command-hook mapping, private bridge, conservative permission responses, setup and version-specific host verification.
- `cross-host-decision-recording`: Host-qualified archives and inspector compatibility across Pi and Claude Code.

### Modified Capabilities

- `global-tenet-control`: Extend cooperative activation to the Claude Code bridge and add owner CLI access while preserving existing Pi command semantics.

## Impact

- Likely implementation areas: `src/pi/guard.ts`, `approval.ts`, `activation.ts`, `config.ts`, `consequences.ts`, `boundary.ts`, decision contracts, recording identity/indexing, inspector views, package entry points and new runtime/Claude Code modules.
- Existing Pi tests, including pinned-host smoke tests, remain regression gates. New runtime contract, bridge process and Claude Code host tests are required.
- Existing session-policy eligibility and configurable-policy semantics remain unchanged. New runtime requirements reuse them for Claude Code without renaming Pi-specific UI requirements.
- The active standalone-inspector and observe-mode changes already have implementation in this checkout. This change builds on those behaviors without rewriting their planning artifacts.
- No automatic changes to the owner's Claude Code settings during implementation or tests. Supply explicit setup/removal instructions and isolated fixtures.
- Codex, Cursor, LangChain adapters, remote multi-tenant services, a provider marketplace, additional judges and Claude Code approval UI are out of scope. The runtime must not require an interactive desktop or Pi dependency.
