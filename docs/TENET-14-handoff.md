# TENET-14 handoff

Pi's policy guard now uses the documented compiled `tenet` SDK. The task began at `19608c811f9d557f3347748fa4a4b6cadcd6f5c1`.

## Ownership

- The SDK opens policy-scoped sessions and owns assessment, permission, approval binding, cancellation, observation scheduling, control watches, archive capture and bounded disposal.
- Pi owns native event translation, trusted confirmation serialization, selectors, footer/status, exception handling, inspector launch and native executor dispatch. It constructs no runtime, provider, activation store or archive.
- `src/pi/history.ts` translates the selected native branch into assessed-call tool observations for `setHistory`. Owner findings and prior consent are excluded in both modes. The SDK applies evidence bounds and redaction.
- Permission and assessment events expose one public typed `OwnerReport` for live findings. `onOwnerRecord` separately preserves non-message native transcript stages for historical recovery without replacing the SDK-owned archive. Capture-health events update native status after asynchronous writes.
- `beforeTool.blockReason` comes from the shared veto formatter, so native blocking details retain rule locations and exclude advisory WARN diagnostics.

## Coverage and intentional changes

Pi declares interception, lifecycle invalidation and trusted approval. Exact result correlation, post-hook argument stability and stock authenticated action resolution remain unsupported. New Pi execution records are unknown, even when a native result reports success or failure. Dummy-executor counts and exact arguments establish execution in offline tests. Existing archives retain their recorded outcomes and contract versions.

SDK result handling still admits untrusted result content as history, but does not admit results for calls bypassed while off or control-unavailable. Dormant and off calls remain assessment/capture bypasses, not evaluated ALLOWs.

Pi source loading now requires the compiled SDK. `bun run pi` and `bun run smoke` build it automatically. Owner checkout installation instructions include `bun run sdk:build`.

Claude source, offline prototype tests and its unverified-coverage warning are unchanged. Its existing internal result behavior is unchanged. No live evaluator or model request ran.

## Offline evidence

- Pinned Pi 0.85.1 resource loader, hooks and dummy dispatcher cover allow, block, approval denial/acceptance, arguments changed before approval release, fresh retry consent, cancellation, switch/fork/tree/reload/shutdown and restart usability.
- Pi 0.85.1 prepares a model's tool batch serially even in parallel executor mode. The concurrency smoke therefore overlaps native `ExtensionRunner.emitToolCall` hooks directly, then dispatches only released calls through the loaded dummy tool. It verifies serialized dialogs, withheld executor counts and independently approved arguments.
- A stalled observe judge finishes after execution and turn end. Findings remain owner-only, do not prompt, do not veto and do not reach model context or protocol stdout. Pinned policy-free and off sessions make no assessments or native records.
- Scripted Pi/standalone parity tests compare permission, reasons, rules, diagnostics, approval conditions and contract metadata for PASS, FAIL and APPROVAL_REQUIRED while retaining different declared host capabilities.
- Existing SDK handoff, lifecycle, consumer, history, shared-runtime, approval, recording, historical reader and Claude regressions pass.

## Validation

All checks use injected judges or scripted responses.

- `bun run sdk:build` and `bun run inspector:build`: pass.
- `TMPDIR=/private/tmp bun test --isolate --max-concurrency=1 --timeout=30000`: 553 passed, zero failures across 64 files.
- `bun run typecheck`: pass, including the executable SDK example.
- `bun run inspector:check`: zero errors and warnings.
- `CI=1 bun run inspector:test`: 16 component and 24 browser tests passed.
- `bun run sdk:example`: passes offline under Node.
- `git diff --check`: clean.

The full test invocation uses a short physical temporary directory because the context-mode subprocess temporary path exceeds Claude's existing 100-byte Unix socket path limit. The nested BB plugin dependencies were installed separately for the repository-wide suite. Neither workaround changes source, dependencies or lockfiles.

## Completion review

The single fresh-context reviewer requested changes for two P2 findings. Both are resolved without a second review pass:

- Current denial and action-resolution findings no longer pass through the historical reason whitelist before reaching live UI. Permission and assessment events use the same public typed `OwnerReport`; Pi consumes it directly. Historical validation remains at transcript-read time and recognizes the current reasons.
- An enforce-mode transcript append failure no longer suppresses the independent live owner finding. SDK owner event delivery and transcript serialization are separate callbacks.

Six new native regressions failed before these fixes and now pass. They cover denial, dismissal, UI failure, action-resolution capture/revalidation failures and enforce append failure. Recovery assertions also caught an earlier decision overwriting a terminal enforcement failure reason; recovery now keeps the recorded enforce permission reason. A seventh test changes arguments from owner delivery before final release, verifies blocking, and checks that superseded permission reports update the same invocation rather than duplicating owner counts.

Human review remains before task acceptance.
