## 1. Policy and mode contracts

- [x] 1.1 Add failing parser tests for explicit BLOCK/WARN, legacy declarations, preserved semicolons, reserved prefixes, empty text, immutable identities and existing bounds; implement rule metadata in policy/contracts and verify `bun test test/policy.test.ts` passes.
- [x] 1.2 Add tests for absent, observe, enforce and invalid TENET_MODE values, including unrelated invalid configuration; resolve immutable mode before fallible setup and verify default observation and explicit enforcement remain distinguishable in startup status.

## 2. Findings and enforcement decisions

- [x] 2.1 Add failing decision tests for the mode-independent severity matrix across PASS, FAIL, UNKNOWN, APPROVAL_REQUIRED and every confidence/evidence gate; implement deterministic aggregation so WARN cannot independently veto or prompt and verify decision and diagnostics tests pass without changing 0.90 defaults.
- [x] 2.2 Introduce versioned reporting contracts separating assessment availability, findings, counterfactual enforcement, actual permission and execution; verify tests reproduce the reported 0.63/0.89 scores, exact boundaries and unavailable assessments without fabricated scores.

## 3. Non-vetoing observation integration

- [x] 3.1 Add observation-mode regression tests for rule failure, would-ask and built-in integrity; implement a shared consequence boundary and verify hooks return no veto, preserve event input and never call confirmation in observe mode.
- [x] 3.2 Add failure-injection tests for missing credentials, provider construction, malformed policy/configuration, unsupported capture, invalid response, provider error and timeout; isolate initialization/evaluation failures and verify observation still permits calls while explicit enforce retains fail-closed behavior.
- [x] 3.3 Cover policy staleness, cancellation, duplicate identities, argument changes, session switch/fork/tree and shutdown during evaluation; route lifecycle paths through mode-aware consequences and verify no TENET observation veto or escaped rejection, while host cancellation and enforcement identity checks remain intact.
- [x] 3.4 Inject failures in record persistence, UI status/notifications and trajectory capture; isolate best-effort reporting and verify observation tool hooks still return without throwing or modifying tool results.

## 4. Owner-only reporting

- [x] 4.1 Add compact owner status and a bounded recent-findings command view using supported pinned Pi non-model UI APIs; verify mode, concern/unavailability counts, eviction, safe rule details and UI-less behavior with fake UI tests and no reporting tool or per-call popup.
- [x] 4.2 Exclude observation diagnostic records from live and recovered evaluator trajectory while retaining enforcement history behavior; verify `test/trajectory.test.ts` and Pi recovery tests cover continuation, fork and selected-branch recovery without observation feedback.
- [x] 4.3 Verify owner record/UI delivery against pinned Pi context construction in integration tests: observation findings must not appear in model messages, prompts, tool results or protocol stdout, including recovery; verify secrets and raw provider prose remain absent from new reports.
- [x] 4.4 Preserve permission/execution correlation for observation, including error results and absent results; verify tests never mark permission alone as successful execution or fabricate correlation for duplicate identities.

## 5. Compatibility and verification

- [x] 5.1 Make existing enforcement and approval fixtures explicitly select enforce mode, retaining prior assertions; add default-observe coverage to pinned host smoke tests and verify both modes execute or prevent dummy executors as specified.
- [x] 5.2 Update offline replay reporting to distinguish counterfactual decisions from observation permissions and unavailable evaluation; verify denominators and historical record handling with scripted fixtures, without network calls or executing fixture commands.
- [x] 5.3 Update README, bundled policy examples and evaluation documentation for the breaking default, mode restart requirement, syntax compatibility, owner-only limits, latency, stale-policy behavior and rollback; verify documented settings and examples match tested behavior without editing an active owner policy.
- [x] 5.4 Run `bun test`, `bun run smoke`, `bun run typecheck` and `git diff --check`; record results and confirm no live provider requests were made. Resolve failures before marking implementation complete.

Verification: `bun test` — 163 passed; `bun run smoke` — 3 passed; `bun run typecheck` — passed. All provider responses were scripted; no live provider requests or fixture command execution. Active owner policy was not edited.

Follow-up: owner overview entries now include rule-text previews. Finding details include complete, scrollable rule text and the built-in integrity wording. New permission records preserve the assessed policy text for recovery; older records explicitly report missing text rather than using the current policy.
