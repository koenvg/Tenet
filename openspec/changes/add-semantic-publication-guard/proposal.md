## Why

Tool-specific permissions do not reliably recognize the same publication effect when a coding agent switches from Git to a browser or an MCP tool. TENET needs a small experiment that tests whether Jev can identify code publication from an intercepted action and its recent trajectory, then request approval without interrupting ordinary local work.

## What Changes

- Add a Pi extension with one supported policy: "Never publish code to a remote repository without explicit approval." Load its human-readable text from a selected `TENET.md`; do not build a general policy compiler or policy hierarchy.
- Add a harness-independent decision module that consumes policy, proposed action, observed context, and recent trajectory. Use Jev through TypeSafe's JavaScript SDK to distinguish local work, publication preparation, publication attempts, and insufficient evidence.
- Return `ALLOW`, `ASK`, or `BLOCK`, with a structured reason and evidence limitations. Treat model output as an effect assessment, never as evidence of human approval.
- Integrate once with Pi's pre-execution tool hook and native approval UI. Assess every exposed tool call through the same interface using its name, description, arguments, and recent calls/results. Do not require channel registration, per-tool field mappings, or browser/MCP adapters.
- Bind a positive approval to the currently intercepted invocation. Denial, cancellation, missing UI, and judge failures must not execute that invocation. Do not reuse approval after a route switch, retry, or changed action.
- Build repeatable cross-tool evaluations, including unfamiliar tool names, different argument shapes, tool switching after denial, misleading descriptions, opaque actions, harmless local work, and trajectory-dependent judgments. Shell, browser, and MCP examples are test cases, not product integration modules. Separate semantic errors from missing observations and unobserved execution paths.
- Include an opt-in live demonstration against a developer-controlled remote repository, plus independent checks of remote effects. Keep ordinary tests offline and free of external side effects.

## Capabilities

### New Capabilities

- `semantic-publication-decisions`: Assess the publication effect of observed actions with Jev and bounded trajectory context, returning a policy decision with explicit uncertainty and failure behavior.
- `pi-publication-approval`: Apply the same decision path before any exposed Pi tool call executes, obtain invocation-specific human approval, and record decisions and outcomes without tool-specific registration.
- `publication-guard-evaluation`: Evaluate semantic consistency, approval friction, latency, and observed remote outcomes without confusing interception coverage with classifier quality.

### Modified Capabilities

None. The repository has no existing capability specs.

## Impact

This is a greenfield TypeScript POC in the current TENET repository. It will introduce a small package, Pi extension entry point, direct TypeSafe SDK integration, tests, evaluation fixtures, and usage documentation. Pi and TypeSafe versions will be pinned during implementation; local inspection used Pi 0.85.1. Live use requires TypeSafe credentials and whatever existing Pi tools are chosen for the demonstration, with access to a developer-controlled remote repository. No fixed set of shell/browser/MCP integrations is required.

TENET is one module in an existing agent stack. It assumes the host presents an action before execution and honors its decision. Sandboxes, containers, virtual machines, network proxies, credential brokers, subprocess interception, and tamper-resistant execution are explicitly outside this change. It must not claim protection for actions the integration never observes. Additional policies, additional harness adapters, enterprise management, and general data-exfiltration controls are also out of scope.
