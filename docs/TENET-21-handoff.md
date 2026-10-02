# TENET-21 handoff

## Scope and implementation base

Task: Unify evidence preparation without changing behavior.

Implementation base: `2c5d4b7c15ead7f0ef887dc36785160e175e9bc6`, clean worktree before changes.

Source specification: [Tenet PR 55](https://github.com/koenvg/Tenet/pull/55), proposal head `f2d9cbbf5b832c5d19ce8ea1ef03763296fe7cf5`. Only the behavior-preserving preparation slice is implemented. No coverage diagnostic, duplicate pooling, relevance selection, new runtime mode or executor changes.

## Changes

- `src/decision/history-selection.ts` owns normalization, redaction, SDK history admission, immutable snapshots and one FIFO selection implementation for admission and submitted-state limits.
- `Observations` and `boundEvidence` delegate to it. SDK `setHistory` no longer has an independent admission loop. `HistoryEvent` shares the structural input contract with SDK `ObservedHistory`.
- `test/evidence-preparation.test.ts` adds authored synthetic full-request baselines. `test/sdk-history.test.ts` pins complete SDK trajectories and permission/assessment outcomes.
- [Inspection evidence preparation](inspection-evidence.md) documents the shared contract, unchanged safety gates and test seams.

Ten authored baseline tests passed on the pre-change runtime before the refactor. The baselines retain even duplicate `history-omitted` entries across pruning phases. Focused trajectory and resolved-action tests also passed after the refactor.

## Offline verification

All required checks passed on the complete task diff:

| Check | Result |
| --- | --- |
| `bun run sdk:build` | Pass |
| `bun run inspector:build` | Pass |
| `TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000` | 564 pass, 0 fail, 65 files |
| `bun run typecheck` | Pass |
| `bun run inspector:check` | Pass, 0 errors and 0 warnings |
| `CI=1 bun run inspector:test` | 16 component tests and 24 browser tests pass |
| BB status plugin `tsc --noEmit` and configured Vitest run | Pass, 18 tests |
| `bun run sdk:example` | Pass under Node, offline |
| `git diff --check` | Pass |

Dependencies were installed with `bun install --frozen-lockfile` and `npm ci --prefix bb-plugin-tenet-status`, matching CI setup. No dependency manifests or locks changed.

Initial validation exposed setup problems: the harness's long macOS temporary path exceeded the existing Claude socket limit, and the BB status plugin dependencies had not been installed. A first Pi smoke run also hit its concurrent-dialog ordering assertion; subsequent full runs passed that assertion without source changes. After dependency setup and a short `TMPDIR`, the full suite passed. Vite emitted a dependency-scan warning while a test server closed, but the inspector dev test and both production/browser checks passed.

No live provider requests, fixture actions, publication attempts or external executor changes occurred. The required suite uses its existing synthetic host dispatch tests; no saved fixture action was executed. Offline tests establish preparation and enforcement mechanics, not evaluator accuracy.

## Completion review

The required single fresh-context read-only review covered the entire working-tree diff, including untracked files, against the implementation base above. Verdict: approve, with no actionable blocking findings or optional suggestions. Review run: `921b3405-98a7-46a9-8efe-146042be3197`.

The reviewer independently ran 72 focused offline tests and root/SDK TypeScript checks. Seeded differential checks against the original implementation matched all 3,506 observation snapshots and 300 final requests, including zero/tiny budgets, redactions, unsupported content and optional metadata pressure. The reviewer reported no Git or repository mutations and no live provider requests or saved fixture actions. The full inspector/plugin suite was not repeated by the reviewer; its passing results are recorded above.

The review report is attached to the BB task alongside this handoff. All acceptance criteria are met. The task is ready for human review.
