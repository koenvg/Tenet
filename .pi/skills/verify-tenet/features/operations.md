# Check the Operations workspace

Use the read-only Operations workspace to inspect local runtime activity in a developer checkout. The default offline proof checks empty telemetry, not active-host monitoring.

## Sub-features

- `operations-open` switches from Inspector to Operations and back.
- `operations-unknown` distinguishes unknown current activity from zero retained requests.
- `operations-trends` exposes missing timing samples without calling them zero latency.
- `operations-coverage` explains local, best-effort coverage and retention.

## How to get to it

Choose Operations in the Workspace navigation. The direct URL is `/?view=operations`. A session or invocation URL parameter selects Inspector instead.

## Drive the empty state offline

1. Complete [Launch](../SKILL.md#launch) with synthetic archives and disposable Chromium. Never substitute an owner's archive or browser.
2. From the repository root, run the existing helper with `CACHE` and a fresh `PROOF` from Launch:

   ```sh
   python3 -I .pi/skills/verify-tenet/scripts/run.py proof --browser-cache "$CACHE" --evidence "$PROOF"
   ```

3. Require the Operations heading, unknown queued/analyzing/approval counts, Completed 0, and No retained requests. The public `/api/operations` response must have unknown coverage, null current activity, and no runtimes or requests.
4. Expand Trend data. Require 15 table intervals with no samples. Expand Coverage and retention. Require the unavailable-reader issue and the local-coverage warning.
5. Require return to Inspector, equal archive hashes, no external requests, `passed: true`, and `serverClosed: true` in `proof.json`. Require `scratchRemoved: true` in `run.json` and confirm the named scratch path is absent. Retain `operations.png`, `operations.aria.txt`, and the command log.

If the doctor or drive fails, preserve evidence and inspect `commands.log`. Rerun the owned helper with a new evidence directory. Do not drive another listening reader.

## Cover populated telemetry separately

When changing runtime rows, filters, timing, or request details, use the synthetic journeys in [operations.pw.ts](../../../../inspector/tests/integration/operations.pw.ts). Follow the [isolated browser test setup](../../../../inspector/tests/README.md) first. From the repository root in that clean shell, build inspector assets, then run:

```sh
bun x playwright test --config inspector/playwright.config.ts inspector/tests/integration/operations.pw.ts
```

Require exit zero. These journeys cover populated rows, pagination, exact-recording handoff, expiration, polling, selected controls, and responsive layouts. They use fictional runtime publications, not an active installation.

## Limits and skipped entry points

- The default proof seeds recorded sessions but no Operations runtime publications. Unknown current activity and the unavailable-reader issue are expected. Neither proves no tools are running.
- The default proof does not visit populated project choices, search, state filters, timing-window changes, Queue board, request details, enabled pagination, or Open in Inspector. Direct URL loading, history, stale-runtime recovery, and responsive behavior also need separate journeys.
- Missing or stale activity is not zero. Local telemetry cannot prove machine-wide completeness, evaluator accuracy, provider connectivity, or active owner hooks.
- Analysis timing is not isolated provider latency. Assessment completion does not prove execution. Approval remains in the host; this workspace cannot approve, retry, cancel, or execute tools.
