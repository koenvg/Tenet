## 1. Lock down eligibility behavior

- [x] 1.1 Extend `test/guard-harness.ts` to start without a local policy and add tests for dormant observe/enforce calls, results, UI, commands, records, judge and archive capture; verify the new tests fail before the guard change and pass afterward.
- [x] 1.2 Add tests for local valid/malformed/unreadable/broken-link policy, explicit absolute/relative/missing/empty `TENET_POLICY`, and absent-local versus explicit-missing in both modes; verify the unavailable paths never go dormant and the applicable enforce calls block.
- [x] 1.3 Add tests for a policy disappearing after activation, a policy appearing after dormancy, and shared on/off or unavailable control in a dormant session; verify transitions do not silently change eligibility mid-session.

## 2. Gate the Pi session

- [x] 2.1 Implement the session-start eligibility check with confirmed local absence distinct from validation failure; verify the eligibility tests from section 1 pass.
- [x] 2.2 Gate guard events, control watching, archive binding, recording, startup/status UI and owner command registration on eligibility while preserving eligible-session behavior; verify dormant tests pass with no TENET side effects and existing guard tests still pass.
- [x] 2.3 Extend `test/pi-smoke.test.ts` to load TENET in a policy-free Pi session, then an eligible session; verify command visibility, footer silence, tool-call bypass in both modes, and eligible status with the pinned Pi host via `bun run smoke`.

## 3. Document and verify

- [x] 3.1 Update `README.md` installation, mode, policy and rollback guidance to distinguish dormant, OFF, and unavailable states, including explicit-path activation and the absence of bundled fallback; verify the documented cases against the new tests.
- [x] 3.2 Run `bun test`, `bun run typecheck`, `bun run smoke`, and `openspec validate activate-tenet-only-with-policy --strict`; verify all pass and report any live global-install behavior as untested until a separately authorized rollout.
