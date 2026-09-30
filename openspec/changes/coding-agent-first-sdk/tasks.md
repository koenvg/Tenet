# Tasks

## 1. Establish the shared SDK interface

- [ ] 1.1 Add public-interface tests in `test/sdk-contract.test.ts` using scripted judges and isolated control/recording paths for ready, dormant, uninitialized and unavailable sessions; verify the new cases first fail because the SDK entry is absent and never contact a provider.
- [ ] 1.2 Add `src/sdk/` with a guard factory and session handles over the existing runtime, moving lazy judge, activation, archive and shared startup/teardown ownership out of host-specific wiring; verify the session tests pass without exporting internal runtime classes.
- [ ] 1.3 Expose explicit permission, assessment status, bypass reason, execution status and bounded owner events, plus bounded history input; verify stalled observe work releases permission before assessment, enforce waits, WARN stays advisory, and pending/off/dormant never becomes a fabricated pass.
- [ ] 1.4 Add contract cases for invocation-local confirmation, retry isolation, denied/missing UI, visible argument mutation, policy staleness and forged transcript consent; verify no affected enforce invocation reaches the dummy executor and existing decision/approval gates remain unchanged.
- [ ] 1.5 Implement session-scoped turn completion, invalidation, idempotent close and bounded guard disposal; verify late results cannot release cancelled work, valid observation survives turn end, closing one session preserves another, and no watches or pending resources survive disposal.
- [ ] 1.6 Document the alpha interface and adapter obligations in `docs/sdk.md`, including owner-only events, declared coverage, post-hook limits, dependency injection, capture and disclosure; verify its synthetic-host example typechecks and runs with a scripted judge and no production credential.

## 2. Build a host-independent consumer entry

- [ ] 2.1 Add the curated SDK package export, ESM/declaration build and optional Pi host peer handling while retaining the package's name and private status; verify plain Node and Bun import from compiled output without Pi installed or consumer-side TypeScript execution.
- [ ] 2.2 Add isolated consumer tests in `test/sdk-consumer.test.ts` for runtime resolution and TypeScript declarations; verify public types do not pull in Pi, inspector or private source paths and importing the SDK creates no files, watchers or provider requests.
- [ ] 2.3 Update developer build/check scripts and the SDK guide with the compiled-entry build prerequisite and supported Node/Bun versions; verify the documented build and example import commands work from a clean checkout without changing semantic contracts or question versions.

## 3. Put Pi on the same SDK

- [ ] 3.1 Refactor `src/pi/guard.ts` to use the documented SDK entry for shared construction, sessions, permission and lifecycle state while retaining native event translation, transcript recovery, approval queue, owner reporting and exception handling; verify it no longer directly constructs a second shared runtime/judge/control/archive stack.
- [ ] 3.2 Extend pinned Pi smoke and adapter tests to cover observe finding delivery, enforce allow/block/approval, cancellation, arguments changed before release, lifecycle transitions, dormant projects and off/on; verify dummy-executor counts and arguments, and preserve owner-only messages and current coverage limitations.
- [ ] 3.3 Add scripted parity cases between the public SDK synthetic host and native Pi mapping; verify equivalent assessment/permission diagnostics without claiming identical unsupported host capabilities or live semantic accuracy.
- [ ] 3.4 Document the SDK/Pi ownership split and preserve Claude Code's prototype warning; verify no new Claude approval or coverage claim appears and existing shared-runtime/Claude offline regressions still pass.

## 4. Add offline setup diagnosis

- [ ] 4.1 Add shared read-only readiness inspection and a compiled CLI `doctor` command supporting selected cwd, text output and JSON; verify valid local policy, explicit override, missing/malformed policy, missing credential, invalid configuration and incomplete delivery cases against current parser and readiness semantics.
- [ ] 4.2 Report ready/off/dormant/unavailable separately, with stable exit behavior, capture configuration, bounded safe causes, tested host version and explicitly unverified connectivity/hooks; verify unknown version stays unknown, detected untested versions report unavailable compatibility, and off/dormant never appears as assessed ALLOW.
- [ ] 4.3 Add `test/doctor.test.ts` with canary credentials and policy text, network/provider traps and before/after directory snapshots; verify doctor creates no files, recordings, settings or watchers, sends no evidence, and leaks neither canary in text or JSON.
- [ ] 4.4 Document direct Node invocation before global binary installation, doctor states, corrective actions and the difference between local readiness and active hooks; verify all command examples against disposable project fixtures without starting the owner agent.

## 5. Deliver the production Pi archive

- [ ] 5.1 Add one packaging command that produces compiled SDK/CLI entries and declarations, the thin Pi resource, inspector runtime/assets, runtime documentation and licenses with a production manifest and matching dependency lock; verify every declared entry exists and production installation uses no development dependencies or mandatory Pi peer installation.
- [ ] 5.2 Add `test/install-archive.test.ts` to extract and relocate delivery outside the checkout, install production dependencies and exercise SDK runtime/types, CLI diagnosis and inspector serving; verify no repository paths, source transpilation requirement, missing runtime entry or frontend build dependency remains.
- [ ] 5.3 Exercise delivered Pi discovery and a harmless scripted policy-to-findings/enforcement flow with isolated Pi settings and home; verify the pinned loader finds exactly one extension, enforce withholds the dummy executor when required, observe never vetoes, and no owner configuration or live evaluator is touched.
- [ ] 5.4 Add content assertions excluding recordings, credentials, owner policy, eval/test fixtures, developer `node_modules`, development-only scripts and checkout-specific paths; verify the packaging tests reject deliberately contaminated delivery fixtures.
- [ ] 5.5 Change `.github/workflows/ci.yml` to invoke the same verified packaging command for its private install artifact and include package tests after required builds; verify local workflow-equivalent commands produce the tested archive without an npm publication or release step.
- [ ] 5.6 Update `docs/INSTALL-ARCHIVE.md` with the verified stable-directory production install, direct doctor invocation, Pi registration, restart and removal recipe; verify the complete recipe in the isolated archive test and state honestly that managed one-command/public installation is not delivered yet.

## 6. Make the owner quickstart the entry point

- [ ] 6.1 Restructure the README's entry path around one-time Pi install, secure credential configuration, an owner-written `Rule; BLOCK;` example, offline doctor, observe status and owner findings; verify the commands against isolated fixtures and retain links to detailed operation rather than dropping limits.
- [ ] 6.2 Add a focused troubleshooting and enforcement section covering no-policy dormancy, invalid active policies, missing credentials, unverified host coverage, pending/lost findings, full-process enforcement opt-in and on/off versus recording opt-out; verify these explanations against existing activation/control tests and the new doctor output.
- [ ] 6.3 Put TypeSafe disclosure, default secret-bearing local capture, before-launch `TENET_RECORDING=off`, post-hook races and non-sandbox limits before the first assessed example; verify documentation examples neither suggest editing active policy through the guarded agent nor use real publishing to demonstrate setup, and removal guidance preserves historical records.

## 7. Verify integration and handoff

- [ ] 7.1 Build the SDK and inspector, then run the full checks in `CONTRIBUTING.md`: `bun test --isolate --max-concurrency=1 --timeout=30000`, `bun run typecheck`, `bun run inspector:check`, and `CI=1 bun run inspector:test`; verify SDK, doctor, delivery, Pi smoke, shared runtime, Claude offline and historical inspector regressions pass without a TypeSafe request.
- [ ] 7.2 Validate the OpenSpec change strictly and review the final diff for scope; verify no prompt, assessment profile, threshold, archive-schema or external owner-policy change slipped into packaging work and other in-flight change artifacts remain untouched.
- [ ] 7.3 Record tested runtime/host versions, delivery contents, offline evidence, installation/rollback steps and remaining unsupported coverage in the implementation handoff; verify the handoff makes no public-publication, live-accuracy or verified-Claude claim and notes that reverting to a pre-SDK archive removes the alpha entry.
