# Check MCP tool hooks offline

Use this experimental developer-checkout prototype to test Tenet's MCP hook exchange with a local fixture host or an explicitly selected native Pi test. It does not connect to OpenAI dots or verify enterprise hook coverage. It is not included in the production archive.

## Run the local check

You need the locked checkout dependencies, Bun 1.3.14+ and Node 22.19+. Complete the [development setup](../CONTRIBUTING.md#set-up) first. No enterprise account, provider key, browser or model server is needed for this focused check.

The check creates a private temporary process home, uses synthetic policy and a scripted judge, disables local capture and removes its temporary files after the worker exits. It makes no evaluator requests and starts no network listener. Build output remains in the checkout. Do not run this alongside another build in the same worktree.

1. From the repository root, run the canonical isolated entry:

   ```sh
   env -u BASH_ENV -u ENV /bin/bash --noprofile --norc scripts/check-mcp-hooks.sh
   ```

2. Check that the demonstration reports:

   ```text
   Local fixture FAIL: denied; effects=0
   Local fixture PASS: executed; effects=1
   Local fixture APPROVAL_REQUIRED: denied; effects=0
   ```

3. Check the lines prefixed with `SIMULATED host`. These deliberately show an action continuing after an omitted callback, disconnect, missing handler, malformed response or timeout. They are failure demonstrations, not passing assessments. The final demonstration line states that dots and enterprise coverage remain `UNVERIFIED`.
4. Confirm the following integration tests pass and the command exits zero. A nonzero exit means the check is incomplete or an assertion failed.

Inside an already clean shell, `bun --no-env-file run mcp:check` invokes the same runner. Use the canonical entry above if inherited runtime startup hooks are uncertain. As with the [full offline runner](../CONTRIBUTING.md#check-a-change), this isolation is not a sandbox against deliberately hostile code.

## Check native writes with installed Pi 1.3.0

This optional mode runs two tests through Pi's real built-in write executor instead of the simulated fixture executor. It requires a separate installed Pi 1.3.0 package with its matching `pi-ai` package alongside it. It does not upgrade the checkout's pinned Pi dependency or test the production Tenet Pi adapter.

1. From the repository root, replace `/absolute/path/to/installed/pi-coding-agent` with the installed package directory, not the `pi` launcher:

   ```sh
   env -u BASH_ENV -u ENV /bin/bash --noprofile --norc scripts/check-mcp-hooks.sh \
     --pi-package /absolute/path/to/installed/pi-coding-agent
   ```

2. Confirm the output records Pi version `1.3.0` and the selected package and entry-point paths. A different version fails rather than falling back to the checkout dependency.
3. Confirm both tests pass with exit zero. Denial must show zero attempted and completed marker writes and no marker file. Allow must show exactly one attempted and completed marker write; the test independently checks file content and size.

The runner creates a temporary home and project. The harness excludes discovered extensions, skills, templates, themes, context files and stored credentials. It loads only the inline test adapter and enables only native `write`.

Scripted model output requests the write; a scripted Tenet judge supplies the assessment. Network fetch and socket attempts are blocked and counted, and each test requires zero attempts. No normal integration is activated and no registration or running process is changed.

The adapter calls MCP privately from Pi's `tool_call` handler and translates denial into Pi's native block response. It does not ask the model to call an optional checker or use `fixture.run()`. A filesystem observer delegates to the original Node write function and counts marker writes independently of hook labels. Pi's built-in tool implementation is not replaced. Detailed owner findings must remain outside the agent transcript.

This mode verifies only explicit allow/deny of one controlled native write. It does not verify cancellation, concurrent calls, other Pi tools, production Pi adapter compatibility, Pi's built-in MCP connection manager, remote transport or dots. In particular, Pi's documented handler-error blocking policy is not evidence of dots failing closed. All temporary marker files are removed after checking; the output records the observed results.

## Understand the boundary

```text
Fixture host live state ----> trusted local invocation registry
         |
         +--> MCP client --> in-memory MCP transport --> hook service
                                                         |
                                                  compiled Tenet SDK
                                                         |
                                                   scripted judge
                                                         |
         +<--------------- generic hook response <-------+
         |
         +--> fixture marker operation --> independent host record
```

The official MCP SDK performs initialization, tool discovery and tool calls. The fixture uses paired in-memory transports, not remote HTTP. The service exposes `before_tool` and `after_tool`; the host remains responsible for execution.

A fresh SDK permission determines the explicit response. A denial prevents the fixture's marker write, and approval-required assessment stays blocked because this fixture has no trusted approval UI. Observe mode releases independently of later findings. Permission, assessment and actual marker effects are different records.

The trusted local registry is essential. It lets `current()` reread live fixture state during assessment. A remote callback payload alone cannot provide that guarantee. The prototype therefore does not demonstrate a deployable remote Tenet adapter, authentication, final argument stability in dots, or control over delegated tasks.

The fixture's failure modes deliberately model the documented host policy of continuing when hooks fail. Tenet does not grant permission in those cases. A service cannot see a callback that never arrives; only the independent fixture dispatch record reveals that omission. Service records alone do not prove complete coverage.

## Inspect responses and records

The documented supported denial is JSON text in the MCP tool result:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Action blocked by policy hook."
  }
}
```

The response uses a generic reason because the platform may expose it to the agent. Rule text, scores and diagnostics stay in owner-only fixture events. Do not send those events to agent history or later evaluator evidence. Unmatched post-tool observations remain unknown rather than establishing execution.

Admission limits are 64 KiB of serialized JSON per hook event, 256 characters per identity, 16 retained sessions, 32 pending invocations and 1,024 attempts per session. Owner, service, host and effect records each retain at most the latest 256 entries; they are not durable archives. The byte limit applies after the MCP SDK has received the object, not as a remote network-frame limit. These are prototype limits, not enterprise guarantees.

## Fix local failures

### A dependency or compiler is missing

Run the [development setup](../CONTRIBUTING.md#set-up) with the locked dependencies, then rerun the canonical command. The runner builds the SDK and examples before tests; do not run the generated demo directly with your owner home.

### A denial or failure assertion fails

Inspect `test/mcp-hooks.test.ts` and the separate host and service records returned by the fixture. Check the actual marker effect, not only the permission label. Do not change the expected fail-open case into a claim that Tenet blocked an action.

### The local check passes

This establishes local protocol and fixture behavior only. To verify dots, a separately authorized enterprise workspace must prove managed-hook delivery, real denied effects, failure behavior, independent action records and coverage of each claimed native and delegated execution path. No such verification is included here.

## Read the contracts

- [Tenet SDK host obligations](sdk.md#host-obligations-and-approval) define live invocation checks and unsupported capabilities.
- [OpenAI MCP tool hooks](https://learn.chatgpt.com/docs/hooks#mcp-tool-hooks) define hook output and the documented failure behavior used by the simulation.
- [OpenAI managed cloud hooks](https://learn.chatgpt.com/docs/enterprise/agent-security#hooks-in-local-computer-access-with-work-cloud) describe enterprise configuration and coverage limits.

The external contract references were consulted on 16 October 2026. Local success does not verify current behavior in an OpenAI account.
