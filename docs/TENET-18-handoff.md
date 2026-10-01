# TENET-18 handoff

## Outcome

`Guard.status().capture` now distinguishes the configured SDK recording destination:

- `local-archive` reports the local writer's directory, optional configuration issue, and measured failed, dropped, written, pending and drain-timeout counters.
- `disabled` reports the same local fields when recording is configured off or configuration is invalid.
- `external` reports only `health: 'unknown'` when `bindRecording` replaces the archive. It does not invent external loss counters, a directory or durability.

The public `CaptureStatus` union replaces `capture.enabled`. This is an alpha API change, not a compatibility layer. The guide describes narrowing, sink precedence over local recording off, and configuration versus activation/readiness. External binding and writing errors still leave health unknown. Successful external close still says nothing about sink disposal or durability.

No permission, assessment, control, recording format or historical contract changes. Runtime resources and recording ownership are unchanged. No recording condition was added to authorization. Pi and Claude reports remain unchanged because they report their own local archive health.

Baseline: `19608c811f9d557f3347748fa4a4b6cadcd6f5c1`. Scope is the full working-tree diff plus the new compiled-consumer fixture and this handoff.

## Tests and validation

The first compiled regression failed under Node and Bun because the previous implementation reported external capture as `enabled: false` with zero loss counters. It passed after the status change.

The relocated compiled SDK consumer tests cover:

- External sink records alongside explicitly unknown health, including local `TENET_RECORDING=off`, owner activation off and guard close.
- Default local recording, disabled recording, invalid local directory/setting, and measured failed writes without changing the configured destination.
- Throwing external binders and sinks in observe and enforce, with permission still released for a passing assessment.
- Public TypeScript narrowing and rejection of external counters, external directory, fabricated healthy status and the old ambiguous `enabled` property.

Validation passed on Node 24.14.0 and Bun 1.3.14:

- `bun run sdk:build`.
- Focused SDK suite, 55 tests across contract, capability, consumer, lifecycle and handoff tests.
- `bun run inspector:build`.
- `TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000`, 544 passed, zero failures across 62 files, including Pi smoke tests.
- `bun run typecheck`.
- `bun run inspector:check`, zero errors and warnings.
- `CI=1 bun run inspector:test`, 16 component and 24 browser tests passed.
- `bun run sdk:example`, scripted Node example passed.
- `git diff --check`.

Install setup used `bun install --frozen-lockfile` at the repository root and `npm ci` inside `bb-plugin-tenet-status`. The first full suite had three module-resolution failures because the nested plugin's SDK dependency was not installed. Installing its existing lockfile dependencies fixed that setup issue. No manifest or lockfile changes were needed. `/tmp` avoids the existing Unix socket path-length limit in host tests.

## Completion review

The single fresh-context read-only reviewer approved the complete task diff with no blocking or nonblocking findings. The reviewer independently passed all 55 focused SDK tests and `git diff --check`, inspected compiled declarations and output, and confirmed no repository mutation during review. The broader validation above was not independently rerun by the reviewer. Review artifact: `tenet-18-completion-review.md`, attached to the task.

## Rebase onto main

Rebased onto `0af7c72eb732dfbf35ba8fe6c145f0596259567e`, which includes TENET-19's immutable assessment/status contracts. Conflicts in SDK types, the guide and compiled consumer tests were resolved by keeping both tasks' changes. `CaptureStatus` and all its fields are readonly, preserving the upstream frozen-snapshot contract. Both assessment and capture declaration fixtures run with and without `exactOptionalPropertyTypes`; the capture fixture now rejects mutation of external health, local counters and local paths. The upstream assessment fixture checks the replacement capture discriminant rather than the removed `enabled` field.

Post-rebase validation passed: SDK and inspector builds, 56 focused SDK tests, 545 full Bun tests, root typecheck, inspector check with zero errors/warnings, 40 inspector tests, the offline SDK example and the diff whitespace check. The original single completion review above preceded this rebase; it was not rerun.

## Limits

No live provider calls, production credentials or owner recording/control paths were used. Node 22 and real host dispatch were not exercised. External durability remains unknown by design; this change adds no sink-health reporting contract.
