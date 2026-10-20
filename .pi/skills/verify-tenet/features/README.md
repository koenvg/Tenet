# Tenet verification map

Use this maintained map to select user-visible checks in a Tenet developer checkout. Start with [Launch](../SKILL.md#launch), then read every feature affected by the change.

## Baseline preconditions

- Use Python 3.11+, locked checkout dependencies, and the executable Playwright cache.
- Run only against disposable owner state and synthetic archives.
- Set `CACHE` and a fresh `PROOF` as shown in Launch.
- Serialize builds in one checkout. Use another worktree for a concurrent run.
- The offline model/judge boundary is scripted. No evaluator credentials are needed.

## Driving conventions

Run `python3 -I .pi/skills/verify-tenet/scripts/run.py MODE --browser-cache "$CACHE" --evidence "$PROOF"` from the repository root. Replace MODE with the literal mode in the chosen recipe. Use a new evidence path each time.

Prefer named controls. CSS locators below identify existing native disclosures where no unique accessible name exists. Keep finding, permission, and execution assertions separate.

## Proof and skip reporting

Capture the action and resulting state, command exit code, and relevant stored effects. Preserve evidence after teardown. Record feature IDs and entry points covered. Report unmet preconditions and unvisited entry points explicitly.

A command-handler test is not a visual Pi TUI run. Browser review of fictional records does not prove that a tool ran. One convenient entry point does not cover others listed here.

## Features

- [Local preflight](local-preflight.md) covers the offline doctor CLI and configuration readiness.
- [Tool-call gating](tool-gating.md) covers Pi dispatch and one-call approval.
- [Owner controls](owner-controls.md) covers native commands and the shared owner CLI.
- [Session rules](session-rules.md) covers the inspector picker, rule details, and check pagination.
- [Recorded data](recorded-data.md) covers exact evidence, private links, and keyboard return.
- [Operations](operations.md) covers workspace navigation, unknown activity, empty telemetry, and timing/coverage disclosures. Populated runtime journeys are separate.

The SDK has a separate offline [example](../../../../examples/sdk.ts). The BB panel has synthetic preview journeys documented in [Inspector tests](../../../../inspector/tests/README.md). The Claude host remains an unverified prototype. These additional interfaces are not claimed covered by the default proof.
