---
name: verify-tenet
description: Verify Tenet's Pi policy guard, owner CLI controls, and read-only inspector in a developer checkout. Use after changing tool-call gating, local readiness, activation, session rules, or recorded evidence. Run offline with synthetic data and retained browser or command evidence.
---

# Verify Tenet

Prove user-visible Tenet behavior from this developer checkout. Read [the feature map](features/README.md) first and select the affected entry points. Pi is the primary host. The inspector is the browser path; the owner CLI, SDK, and BB status panel are other interfaces.

In a trusted Pi checkout, invoke `/skill:verify-tenet`. After adding or editing this skill, start a new Pi session or use `/reload` to refresh skill discovery. No `.pi/settings.json` entry is needed.

This skill uses existing pinned-Pi tests and real inspector HTTP with Playwright Chromium. Scripted model and judge responses stop at the existing external-provider boundary. They do not prove live judge accuracy, an active owner's hooks, native BB behavior, or the Claude prototype.

## Launch

1. Complete [checkout setup](../../../CONTRIBUTING.md#set-up). Use Python 3.11+, Bun 1.3.14+, Node 22.19+, locked dependencies, and Playwright Chromium. Dependency and browser installation can download packages.
2. Work from the repository root. Set the existing executable cache and a new absolute evidence directory outside the checkout:

   ```sh
   CACHE="$HOME/Library/Caches/ms-playwright"
   PROOF="/tmp/tenet-proof-$(date +%Y%m%dT%H%M%S)-$$"
   python3 -I .pi/skills/verify-tenet/scripts/run.py proof --browser-cache "$CACHE" --evidence "$PROOF"
   ```

   On Linux, set `CACHE="$HOME/.cache/ms-playwright"`. The helper refuses an existing evidence directory. Use a fresh path for every attempt.
3. Require exit zero, `proof.json` with `passed: true` and `serverClosed: true`, `failure-isolation.json` with `passed: true`, `archiveRemoved: true`, and `serverClosed: true`, and `run.json` with `scratchRemoved: true`. Inspect the images and action log.

The helper builds the SDK and production inspector, then uses Node's Playwright Test runner for the browser recipes. It seeds four fictional sessions and starts an owned loopback reader on an OS-selected port. Readiness prints `Doctor passed for owned inspector` with its URL and asset-build identity. A second fresh reader checks an intentional failure and its sanitized diagnostics. Both readers close before the helper exits.

Every run gets a private realpath process HOME, XDG/Pi/npm directories, archive, and browser context. Credentials, proxy settings, owner policy, and runtime hooks are excluded from the child environment. Bun dotenv loading is disabled, including nested children. This isolation is not an OS sandbox. Never use personal recordings, attach to an owner's browser, register the extension, or restart an active service.

Separate worktrees are required for concurrent builds because SDK and inspector outputs are shared within one checkout. Readers can use independent ports and archives. Refuse to double-drive a shared instance.

## Doctor

The proof runs a read-only `GET /api/status` before any interaction. It requires HTTP 200 and `tenet-reader-0.1.0/assets-<12 hex digits>`, then checks that its own archive has exactly the four expected session states.

If the owned instance looks wrong during an extended drive, repeat:

```sh
curl --fail --silent --show-error "$ORIGIN/api/status"
```

Set `ORIGIN` to the URL printed by this run, while its process remains alive. Compare `reader.build` to this run's saved doctor result. An arbitrary listening port is not ownership proof. After the one-shot helper exits, connection refusal is expected; rerun with a new evidence directory rather than driving another reader.

For policy/configuration readiness rather than inspector health, use [local preflight](features/local-preflight.md). A local `ready` result does not prove connectivity or hook coverage.

## Drive

Use the executable helper from Launch. Its modes are `proof`, `guard`, `control`, and `preflight`; each writes a command transcript and teardown result. All invocations require the same two options.

The browser proof clicks the rule named `Ask for approval before deploying to production.`, opens `Rule details`, loads `More recorded checks`, expands `View recorded action` and `Recorded data`, and reads exact records. It reopens the private deep link and closes with Escape. It uses public controls, not internal React setters or test endpoints.

The same owned reader also visits [Operations](features/operations.md), expands Trend data and Coverage and retention, and returns to Inspector. Its fixture has no runtime publications. Unknown current activity, no retained requests, and no timing samples are expected, not proof of healthy active-host monitoring.

The proof runs from its private evidence directory, so failure diagnostics stay outside the checkout. Its synthetic failure check uses a canary `.env` to confirm that the actual trace sanitizer runs under Node without loading dotenv. It removes the canary and probe executable after the check; the sanitized trace and witness remain as evidence.

Use [session review](features/session-rules.md) and [recorded evidence](features/recorded-data.md) for the stable locators and additional entry points. Use [tool-call gating](features/tool-gating.md) and [owner controls](features/owner-controls.md) for native command and approval checks.

## Evidence

Retain `$PROOF` after cleanup. Browser proof writes:

- `commands.log` with exact commands, combined stdout/stderr, versions, and exit codes.
- `proof.json` with the doctor response, user actions and observed results, private link, archive hashes, and server-closed assertion.
- `before.png`, `rule.png`, `after.png`, `evidence.png`, and `reopened.png`, plus before/after/reopened ARIA snapshots.
- `detail.json` with the synthetic public detail response.
- `operations.png` and `operations.aria.txt` with empty-telemetry observations. `proof.json` records the public Operations response and the exact evidence fields compared with the detail API.
- `failure-isolation.json` with `passed: true`, `archiveRemoved: true`, and `serverClosed: true`, plus `sanitizer-witness.json` showing Node with no dotenv canary. Expected-failure diagnostics remain under `$PROOF/coverage/inspector-artifacts/playwright/`.
- `run.json` with command results and scratch-removal confirmation.

Exercise each affected mapped entry point. A screenshot alone is insufficient. Pair the action with its resulting state and verify effects independently. The browser proof compares exact displayed JSON to the public read API and hashes archive bytes before and after to prove read-only behavior.

For command modes, retain the transcript and assertions about executor counts, persisted control state, capture, and unchanged files. These are integration checks, not visual TUI proofs. Do not report an unvisited entry point as covered.

There is no generic safe live dry-run here. Real assessed actions can disclose policy, paths, and evidence to TypeSafe and spend quota. Obtain separate authorization before live work. Recordings can retain secrets despite redaction. For any new dry-run, observe files, network requests, browser launches, and Git refs instead of trusting the flag's name. The browser fixture blocks nonlocal requests; the Pi smoke rejects accidental fetches. Synthetic fixture action text is never executed.

## Cleanup

The fixture closes its owned pages, browser, server, and archive even when a drive throws. The helper waits for each command, stops only its own process group on interruption or timeout, and removes only its scratch directory. SIGKILL cannot run Python cleanup.

Normal fixture teardown and Python process-group cleanup are checked. Forced termination of a separately grouped browser after a stuck shutdown is not established by the Python utility tests. Do not claim that fault case from a passing normal proof.

After every attempt, including failures, read `run.json`. Confirm the named scratch directory is absent. On successful browser proof also require `serverClosed: true`. If teardown fails, report the retained scratch path and error; do not delete state while a process may still use it. Never kill by process name.

Evidence and checkout build output survive teardown. Confirm `commands.log`, `run.json`, and the applicable proof files still exist. Preserve failed-attempt artifacts as well.

## Helpers

[run.py](scripts/run.py) is the executable isolated launcher. Invoke it exactly as shown in Launch, with Python isolated mode to ignore owner Python configuration. It runs [proof.ts](scripts/proof.ts) through the owned [Playwright configuration](scripts/playwright.config.ts), using Node rather than Bun for failure diagnostics. The same run calls [failure-isolation.ts](scripts/failure-isolation.ts). Do not run these recipes against owner state.

Run the helper's process-group regressions with `python3 -I .pi/skills/verify-tenet/scripts/test_run.py`. This executable check starts disposable Python process groups with TERM-resistant descendants. It verifies cleanup after parent failure and interruption, refuses unconfirmed removal, and checks that every Python generation ignores synthetic startup hooks. It removes its temporary state.

For broader regression coverage, follow [the canonical offline lane](../../../CONTRIBUTING.md#check-a-change). This focused proof does not replace it. Keep the map current with `/skill:kstack-maintain-verification-skill` and the target `.pi/skills/verify-tenet/`.
