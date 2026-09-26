# TENET-2 handoff

Baseline: `bc11ee1b1eabbe551576e05668ae53f699bbe3c8`.

Observe-mode permission now releases before evaluator submission/completion. The shared runtime owns a FIFO queue (2 running, 32 waiting, 1 MiB retained snapshot bytes, 5 s queue age) and fixes the sanitized action, policy, config, legacy profile, trajectory, evidence and generation before execution. Oversized input or metadata is rejected by a bounded preflight before copying; dropped work permits the call without a would-decision. Enforce mode still awaits the assessment and required native approval.

Schema 3 records assessment lifecycle independently of permission and execution. The reader retains schema-1/2 identities; the inspector displays pending, completed, unavailable, dropped and cancelled states, queue wait and provider duration. Pi's owner view separates pending work from its 100 retained terminal reports so a pending BLOCK finding cannot be evicted by newer calls. Completed clean ALLOW assessments count as coverage, not concerns. Off, replacement, stale policy and shutdown cancel remaining work; agent-turn end does not cancel valid observations. Missing results stay unknown. See `README.md`, `docs/shared-runtime.md`, and `docs/cross-host-recordings.md` for timing, loss and restart behavior.

Validation after review fixes:
- `bun run typecheck` — passed.
- `TMPDIR=/tmp bun test --parallel=2 --timeout=30000` — 355 passed, 0 failed. Short `TMPDIR` is required by the Claude socket-path limit in this long BB worktree; bounded parallelism avoids Bun's node:test nested-test error after a parallel timeout.
- `TMPDIR=/tmp bun run inspector:test` — 14 component tests and 23 browser/integration tests passed.
- `git diff --check` — passed.

The single required read-only review requested changes for pre-copy snapshot bounding and pending-report eviction. Both were addressed with `src/decision/evidence-budget.ts` and separate pending/terminal owner tracking, with regression tests in `test/background-observation.test.ts`. Per the implementation review gate, no second review pass was launched. No live evaluator or production host run was performed. Diagnostic capture remains best-effort, and an already-running inspector needs a rebuild/restart to read schema 3.
