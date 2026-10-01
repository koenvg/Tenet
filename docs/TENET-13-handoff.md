# TENET-13 handoff

## Result

The private alpha entry `tenet` now builds compiled ESM and declarations for Node 22.12+ and Bun 1.3.14+. Import and construction do not create files, watches or provider requests. Public session handles reuse the existing runtime rather than a second assessment engine.

Baseline: `0c5c8031f1ad9328e64bb73cd5cf4380138491bd`.

## Changes

- `src/sdk/` exposes `createGuard`, `SDK_VERSION`, typed session handles and curated immutable owner events. Results separate permission, assessment, counterfactual, bypass and execution.
- `src/runtime/resources.ts` owns lazy judge construction, activation, archive binding and bounded teardown for SDK consumers. `src/runtime/approval.ts` bounds injected UI wait and rejects late consent after timeout or cancellation.
- The runtime supports session-local turn completion and per-invocation assessment/decision delivery. Live owner decision/approval records no longer enter later runtime evaluator evidence. The corresponding Pi assertion checks that separation.
- `test/sdk-handoff.test.ts` covers revocation from owner callbacks and the runtime-to-SDK microtask gap. Both original review reproductions also run through isolated compiled Node/Bun consumers. Owner events are informational; only the final returned `beforeTool` permission authorizes host dispatch.
- Root exports select compiled JavaScript and declarations. Pi's peer is optional. CI builds the SDK before consumer tests and includes compiled output in the existing archive. This is not the production-only packaging redesign.
- The owner requested the shorter `import ... from 'tenet'` after initial implementation. The package is now named `tenet` and exports the SDK at its root. This supersedes the planning document's original package name; no old import alias remains and the package stays private.
- The owner also approved `createGuard({ host, capabilities: [...] })` in place of the boolean-object input. Only `host` is required; optional named guarantees default to unsupported. Host metadata and extra limitations are optional. The SDK validates and copies declarations once; the existing explicit coverage status and archive representation remain unchanged.
- `examples/sdk.ts` is an executable, typechecked scripted host. `docs/sdk.md` documents dispatch, cancellation, approval, disclosure, capture, unsupported coverage and disposal obligations.
- SDK contract, lifecycle and isolated-consumer tests exercise offline judges/sinks, policy-scoped readiness, approval binding, background observation, correlation limits and control-watch ownership.

## Validation

Tested locally with Node 24.14.0 and Bun 1.3.14. CI selects Node 22; declarations target ES2023 with Node 22 types. No live evaluator requests, package publication or owner installation ran.

- `bun run sdk:build`: passed, including guide compilation.
- `bun run sdk:example`: passed offline.
- `bun run typecheck`: passed, including the public guide.
- `bun run inspector:build`: passed.
- Final `TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000`: 540 passed, zero failed across 62 files, including capability declarations, permission/archive finalization and history-omission regressions.
- `bun run inspector:check`: zero errors/warnings.
- `CI=1 bun run inspector:test`: 16 component and 24 browser tests passed.
- BB plugin TypeScript check: passed after `npm ci --prefix bb-plugin-tenet-status`, as CI requires.
- `git diff --check`: passed.
- After the requested `tenet` import rename: frozen-lockfile install, SDK build/example, repository/guide typecheck, bare Node/Bun imports, and 27 SDK/Pi-smoke tests passed. Inspector checks were not rerun for this import-only change.

The short TMPDIR avoids the existing Claude bridge's Unix-socket path limit under context-mode's long temporary directory. One full run exceeded a pre-existing archive test timeout and lost a bounded-drain stage under slow filesystem writes; the two affected files passed a focused retry, followed by the clean 508-test full run. Capture deadlines and defaults were not changed to hide that behavior.

The original completion review requested changes for a P1 authorization-handoff race. The parent reproduced all 14 revocation variants against compiled output before fixing it. Invocation-bound runtime checks now revalidate lifecycle, cancellation, identity, original arguments, policy and resolver state after the runtime await and owner delivery, ending with a synchronous gate. The original reproductions also pass in relocated Node/Bun consumers.

After capability simplification, the owner explicitly requested a new fresh-context SDK interface review. It approved the capability-list design but returned request changes for two P2 correctness issues, with no P0/P1. Both were reproduced and resolved by the parent:

- Prepared release previously entered recording and result tracking before final SDK checks. One runtime finalizer now commits terminal permission exactly once. Pending lifecycle invalidation and shutdown commit blocked permission before dropping recording ownership. Cancellation no longer filters out terminal permission, while off still suppresses capture. The SDK reuses the finalizer's outcome instead of resetting a recording flag and replaying completion. Committed release reporting runs outside the final synchronous handoff and teardown flushes queued reporting. Fourteen compiled revocation cases now assert a single blocked sink/archive permission and no execution stage. Additional cases cover successful ALLOW/approved ASK, SDK-owned archive closure and off during preparation.
- Bounded host-history admission now reports excluded prefix and rejected-event counts through `Observations`. Compiled-entry tests cover zero retained events, over-budget content, redaction and an excluded-prefix accessor that must never be read. The judge sees the correct `omitted` count and `history-omitted` limitation.

The 14 permission-recording cases and two history cases failed before these fixes. Final validation passed all 540 tests and typechecks. A full-run Pi regression exposed stale-policy reason precedence during duplicate-call invalidation; the finalizer now chooses the latched reason before invalidating, and the existing regression passes. Inspector build/check and all 40 inspector tests passed; those UI-only checks were not repeated after that final runtime reason-ordering fix. No follow-up reviewer was launched. The recorded fresh-review verdict remains request changes; this document records the implementer's resolution, not independent reapproval.

## Follow-up boundary and limits

TENET-14 migrates Pi's native wiring to these SDK handles. Pi currently remains a consumer of the same underlying runtime, not of the new public entry. Native transcript parsing, approval queue serialization and owner UI remain adapter responsibilities. No verified Claude Code or arbitrary-host enforcement claim is added.

The review's nonblocking interface suggestions are separate tasks: TENET-18 distinguishes external capture from disabled local recording; TENET-19 encodes immutable, discriminated assessment/result types. Neither is included here.

The SDK cannot freeze arguments after hook release, certify interception, infer unsupported action facts or infer execution without declared result correlation. Hosts must dispatch only from fresh actual permission and keep owner events out of agent history. Caller-owned UI, providers and injected sinks must release their own external resources on cancellation; guard close does not wait indefinitely for them.

Build from source before importing the entry. A pre-SDK rollback removes the alpha export. Historical assessment contracts and recorded values remain interpretable without migration or reevaluation. The complete SDK guide and this handoff are result artifacts for the task.
