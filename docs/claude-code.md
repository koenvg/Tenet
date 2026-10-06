# Claude Code hook prototype

Use this guide to try the opt-in local CLI hook and Unix socket bridge in an isolated developer checkout on macOS/Linux. This is not a verified enforcement integration. The production archive does not ship this Claude prototype.

No Claude Code binary was available during implementation, so no host version is pinned as tested. Offline fixtures cover the protocol and scripted decisions, not hook activation, denial preservation or result correlation.

Do not rely on this for unattended publishing. Pi installation and `TENET_MODE=enforce` do not establish Claude coverage.

For an existing isolated setup, [read local status](#read-status) or [remove it](#remove-the-test-installation). For an embedding callback or protocol change, use the later reference sections.

## Try it in an isolated installation

Use Bun 1.3.14+ and the repository-only [development setup](https://github.com/koenvg/Tenet/blob/main/CONTRIBUTING.md#set-up). Actual-host testing also needs a suitable Claude CLI, isolated settings and harmless local effects. That verification remains blocked; a protocol fixture cannot replace it.

The bridge uses TypeSafe for live assessment. It sends global and project policy text, paths, tool evidence and bounded recent observations, and uses API quota. Source and secrets can remain despite redaction.

Obtain separate authorization before live evaluation. The following setup instructions are not authorization to start live work.

Review optional global rules before authoring `~/.tenet/TENET.md` yourself outside intercepted actions. They activate projects without local rules, can reach TypeSafe and recordings, and can make the complete set unavailable if invalid. There is no automatic creation, global opt-out or separate budget; both sources share 64 KiB and 16 declarations, with 4096 UTF-8 bytes per rule.

1. Choose a private directory with no symlinked ancestors. The default is `~/.tenet/claude`, with mode `0700`; its socket and session-state files use `0600`. To use another directory, set `TENET_CLAUDE_DIR` to an absolute private path in both bridge and hook environments.
2. Set the same owner home, `TENET_MODE` and `TENET_POLICY` on both sides. Start in `observe`, the default. Put an owner-reviewed `TENET.md` in the Claude session cwd, outside the guarded agent's intercepted path, or select a project file with `TENET_POLICY`.

   Absolute overrides stay absolute; relative overrides resolve against the session cwd, not the bridge directory. Optional `~/.tenet/TENET.md` is also selected from each process owner's home. The override never replaces global.

   Only confirmed absence of both implicit candidates with no override makes a fresh session dormant. Missing explicit files, empty overrides and unusable sources remain unavailable.

   Hook/bridge home or project-selection disagreement cannot establish ready permission. See [global and project selection](policy.md#choose-the-policy-file).

   The bridge process needs `TYPESAFE_API_KEY`; hooks never read that key from tool input.
3. Choose capture before starting the bridge. It records submitted evidence by default in `~/.tenet/recordings`, including passes and observe-mode calls. Set `TENET_RECORDING=off` in the bridge process to opt out. Setting it only in hook clients does not disable bridge capture, and opt-out does not stop provider disclosure.
4. Start the bridge in a terminal. Replace `/ABSOLUTE/TENET` with the checkout path. You can run this from any directory:

   ```sh
   bun /ABSOLUTE/TENET/src/claude/cli.ts bridge
   ```

   Expected terminal message:

   ```text
   TENET Claude bridge running. Host coverage unverified.
   ```

   The bridge does not daemonize. Keep the terminal open; Ctrl-C stops it. A running socket proves only bridge availability, not Claude hook coverage.

5. Copy the repository-only [example hook settings](https://github.com/koenvg/Tenet/blob/main/docs/claude-hooks.example.json) into a separate Claude settings file. Replace `/ABSOLUTE/BUN` with the Bun executable path and `/ABSOLUTE/TENET` with the checkout path. Tenet does not edit owner settings. Test with a disposable project and isolated settings first.

The settings use synchronous command hooks. `PreToolUse` has no `matcher` or `async`, so built-in and MCP tools use the same path. Do not add argument-mutating hooks and then claim assessed arguments stay stable.

## Remove the test installation

1. Remove hook entries from the isolated settings and stop the bridge. This removes interception, not old recordings or shared control state.
2. To discard test session markers, stop both Claude and the bridge. Inspect and remove only the private test directory yourself.

After a crash, inspect a leftover socket and remove it manually with the bridge stopped. The bridge will not replace an existing socket. Do not delete state while its processes are running.

## Hook permission and lifecycle

```text
Claude hook -> local bridge -> assessment and permission
                  |                       |
                  v                       v
             owner recording       hook pass or denial
                                           |
                                           v
                              Claude native executor, unverified
```

The hook exchanges protocol messages with the bridge. Claude still owns native permissions and execution. This flow does not establish that a particular Claude binary runs the hooks or honors their output.

The hook reads bounded JSON on stdin and writes one Claude protocol JSON object on stdout. A pass writes `{}` and leaves native permissions in force. Observe emits no veto or finding to agent-visible output.

In enforce mode, BLOCK and unsupported ASK produce `PreToolUse` deny. Failure to contact the bridge, invalid response, unsafe local path or missing eligibility state also denies a pre-tool call. There is no trusted Claude approval channel, so ASK is denied in enforce.

### Keep session eligibility separate from readiness

- Only `SessionStart` with `source: "startup"` can establish a new policy-free dormant session when state is absent.
- A policy-eligible session started while off keeps minimal eligibility metadata, not action payloads. If its bridge was running then, switching on lets its first call resume in that bridge generation without another `SessionStart`.
- A session started without a bridge cannot later resume automatically. Repeated starts retain prior eligibility, even after policy deletion.
- `SessionEnd` removes the marker and releases bridge capacity. A lost marker on resume is unavailable, not dormant.
- Bridge restart invalidates live and deferred markers. Start a new Claude session to establish one; restart does not resume pending calls.

Policy-only changes require bridge session reselection through the existing `SessionStart` path; a full bridge restart requires a new native session. Keep hook/bridge home and selection equal. Before live work, run [doctor for the session project](doctor.md#direct-invocation) with the bridge's environment to check both source digests and total count, then read prototype status. Prototype status reports eligibility and readiness, not source details; doctor does not verify active hooks. Pi commands do not reload this bridge. Off/on does not refresh a stale set. Older releases may ignore global discovery; keep the new release or first review a complete policy selected for each session using the older release's supported selection.

Off comes from cooperative owner control, never tool arguments. Tool descriptions and parameter schemas are absent from hook inputs and are not invented. Hook-supplied transcript paths are never opened.

### Keep unsupported coverage visible

Result and lifecycle mapping remain provisional pending actual-host verification. Claude decisions use the host-qualified cross-host archive. A missing result cannot certify execution.

This code does not stop hook invocations outside a live bridge, disabled or unstarted hooks, forced termination, host hook timeouts, execution outside exposed tool hooks or same-user tampering. Test killed/timed-out hooks and parallel argument mutation on a pinned Claude version before calling enforcement supported.

Stock Claude also has no authenticated action resolver. See [action resolution and executor duties](action-resolution.md).

## Owner control and status

Use the same control path for Pi, the bridge and hook clients. The default is `~/.tenet/control.json`, independent of `TENET_CLAUDE_DIR`.

If you set `TENET_CONTROL_PATH`, set it in all three processes. Pi's explicit `controlPath` embedding option takes precedence.

The control file uses mode `0600` in an owner-only directory without symlinked components. Bridge socket and markers remain in the separate private Claude directory. The CLI does not install hooks, start the bridge, change `TENET_MODE` or `TENET_RECORDING`, or delete old recordings.

### Read status

From any directory, replace `/ABSOLUTE/TENET` with the checkout path. These commands read local status and make no evaluator request. Replace `SESSION_ID` with the selected native session ID when needed:

```sh
bun /ABSOLUTE/TENET/src/claude/cli.ts status
bun /ABSOLUTE/TENET/src/claude/cli.ts status SESSION_ID
```

Status works while the bridge is stopped. Read each field separately:

| Field | Meaning |
| --- | --- |
| Activation | `on`, `off` or `unavailable` for corrupt/unsafe control. Never-configured control defaults to on. |
| Mode | This CLI process's configured mode. Running processes keep their own mode. |
| Bridge mode | Separate from CLI mode; unknown when disconnected. |
| Bridge `running` | Its private socket answered the versioned status request, not proof of installed hooks. |
| Coverage | Unverified until actual-host tests establish a supported version and configuration. |
| Action resolution | Unsupported; no authenticated executor integration. |
| Policy readiness/session eligibility | Unknown without a selected running session. `status SESSION_ID` asks for its last readiness if present. |
| Capture | Bridge writer configuration and loss/pending counts, never the CLI's `TENET_RECORDING`. |

Capture `on` means configured best-effort capture, not durable writes. `degraded` reports observed loss. Without a bridge, capture is unknown unless activation is off or unavailable. Those states stop new capture but cannot recall queued writes.

### Change cooperative activation

Off skips new assessment and capture and cancels pending work when each runtime observes it. It cannot recall dispatched work. CLI success does not wait for cancellation acknowledgments from other processes; another process can assess or release before it sees off.

From any directory, with the same path replacement, choose one command:

```sh
bun /ABSOLUTE/TENET/src/claude/cli.ts off
bun /ABSOLUTE/TENET/src/claude/cli.ts on
```

`off` and Pi's `/tenet off` save the same owner-machine choice. Running Pi and the bridge watch it while idle and recheck before assessment and pending release. A pending enforce call cannot get a late release after invalidation; observe never vetoes. `on` restores each process's configured mode and capture setting. Both commands are repeatable.

A successful CLI write is durable before it prints `TENET OFF saved.` or `TENET ON saved.`, followed by the acknowledgment limit. Queued archive writes can finish after off. Old recordings remain.

Corrupt or unreadable control prevents new assessment/capture. Enforce denies eligible pre-tool calls; observe permits them without claiming a pass.

A safe malformed file can be replaced with `on` or `off`. Unsafe permissions or symlink paths make the write fail without a success message.

This switch is not an OS boundary. A process with owner filesystem access can edit, replace or remove control, settings or socket state. Removing control lets a new process default to on.

## Programmatic owner records

An embedding can explicitly pass `onOwnerRecord` to `startBridge` for immutable shared owner records, including finalized runtime evidence context. It stays in-process, receives neither submitted requests nor raw provider responses, and works with recording off.

The callback must be local and bounded. Exceptions and archive failures do not change permission or approval. Never put records into hook output, tool results or agent history. Hook input cannot register callbacks; socket responses and CLI behavior stay unchanged.

Stock Claude still has no trusted live owner UI, resolver or verified host integration. This callback is for embedding, not a new transport or coverage certificate. See [diagnostic provenance](inspection-evidence.md#runtime-evidence-context).

## Check the protocol offline

From the developer checkout root after setup, these checks use fixtures and make no TypeSafe requests:

```sh
bun test test/claude-bridge.test.ts
bun run typecheck
```

Success means both exit zero. It does not prove actual-host coverage. If a check fails, check dependencies and the named fixture failure. Actual-host verification remains blocked until a suitable Claude CLI can run with isolated settings and harmless local effects. Do not substitute offline protocol success for that gate.
