# KVG-5093 handoff

> Historical publication-slice handoff. The current configurable-rule implementation and owner migration checkpoint are documented in [configurable-policy-rules-handoff.md](configurable-policy-rules-handoff.md). The v3 results below do not validate the new generic questions.

## Delivered scope

Implemented tasks 1.1 through 1.7 of `add-semantic-publication-guard`, using the narrowed ticket as the scope boundary. Slices 2 through 5 remain open.

- `src/decision/`: policy loading and SHA-256 identity, immutable generic evidence, recursive field redaction, validated assessment and deterministic policy mapping, injectable judge and clock, direct official TypeSafe SDK adapter.
- `src/pi/`: environment configuration, generic pre-execution interception, native invocation-local confirmation, argument recheck, startup status and separate assessment/decision/approval/permission/execution records.
- `TENET.md`: the supported policy from the approved ticket. Operators must review their selected policy file before enabling the guard.
- `README.md`: offline verification, opt-in Pi usage, configuration, data disclosure, host contract and limitations.

Pinned dependencies include Pi 0.85.1, TypeSafe SDK 0.6.0, and TypeScript 5.9.3. The repository uses Bun 1.3.14 for installation, tests, scripts, and the Pi CLI. `bun.lock` locks the dependency tree; tsx is no longer needed. The requested Jev identity is `jev-latest`; the provider's returned identity is retained, and no immutable model version is claimed.

## Verification

Verified on Bun 1.3.14:

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed from a clean `node_modules` directory |
| `bun run pi --version` | Pi 0.85.1 under Bun |
| `bun test` | 39 tests passed |
| `bun run smoke` | 2 tests passed |
| `bun run typecheck` | Passed |
| `git diff --check` | Passed |

Policy/decision, SDK adapter, and Pi adapter tests were first run failing before their modules existed, then made green. Deadline tests use an injected clock and include a judge that ignores cancellation and resolves late. SDK tests use the real pinned client with an injected HTTP transport, not a replacement SDK.

The integration smoke uses Pi's actual resource loader, AgentSession hook installation, ExtensionRunner and agent-core dispatch. It supplies scripted assistant tool calls and scripted Jev responses. Dummy executors verify assessed argument digests against final arguments. It covers withheld execution while confirmation is unresolved, denial, approval, provider errors, unknowns, executor errors, a built-in local read, and local/denied/approved calls to a dynamically registered unfamiliar tool. A separate test loads the production entry through Pi and verifies missing-credential startup and blocking.

Ordinary verification remains offline. After the operator reported read/list false blocks, a separately authorized 24-request synthetic Jev replay reproduced the problem and tested revised generic questions. The final v3 question set matched expected effects and decisions on 6 probe and 6 held-out cases, with thresholds unchanged. See `eval/README.md` and the saved reports. No fixture actions, remote mutation, browser interaction, or live primary-model call occurred. Native UI responses are scripted in tests; terminal rendering and keyboard interaction were not manually exercised. This diagnostic is not the broader semantic or adversarial validation required by later slices.

A subsequent user retry still recorded `publication-effect-v1` despite v3 being on disk. A minimal offline reproduction using the pinned Pi resource loader under Bun changed an imported constant from `before` to `after`, reloaded, and still observed `before`. This is a host module-cache limitation, not another Jev result for v3. TENET now reports the loaded question version in startup records, notifications and the footer, and the production-entry smoke checks v3. Fully restart the Pi process after code changes. Fixing Pi's reload cache is a separate host follow-up; this patch does not modify Pi.

## Follow-up constraints

The next slices own bounded recent trajectory, evidence budgeting, concurrent dialog serialization, complete session lifecycle invalidation and adversarial/live evaluation. Basic checks in this slice do not replace that hardening.

The host must honor blocks and prevent argument mutation after TENET returns. TENET observes outer tool invocations, not subprocess internals or tool-internal background activity, and does not freeze file contents or remote state. Field redaction cannot remove every embedded secret. Permission and a successful tool result are not independent verification of remote effects.
