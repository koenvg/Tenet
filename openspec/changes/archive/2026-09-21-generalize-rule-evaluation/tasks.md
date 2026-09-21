## 1. Generic question contract

- [x] 1.1 Add failing question/SDK contract tests for domain-neutral shared instructions, complete-rule and whole-invocation assessment, independent rule references and unchanged outcome/evidence keys; verify the current domain-specific questions fail the new expectations.
- [x] 1.2 Replace shared semantics in `src/decision/questions.ts` with generic instructions for outcome and evidence assessment, keeping uncertainty labels appropriate to each question; verify the new contract tests pass and manually inspect generated questions for domain definitions, examples or prompt branches.
- [x] 1.3 Assign a distinct QUESTION_VERSION and update version assertions; verify recordings and replay metadata identify the new contract while historical report files remain unchanged.

## 2. Regression and cross-domain coverage

- [x] 2.1 Extend `eval/generic-rule-fixtures.ts` with self-contained resource mutation, communication, scoped-access and synthetic-domain cases, paired equivalent mechanisms and non-triggering controls; verify fixture coverage and expected per-rule outcomes through offline fixture tests without executing actions.
- [x] 2.2 Retain existing local-work, publication and integrity fixtures and add or confirm compound-operation, explicit-exception, prior-approval, adversarial-evidence and material-uncertainty controls; verify scripted contract regressions pass and remain labeled as non-live evidence.
- [x] 2.3 Add or confirm independent-rule and rule-order controls plus unchanged aggregation for identical assessments, including advisory modes, integrity failure and invocation-local approval; verify focused decision, diagnostics and approval-lifecycle tests pass.
- [x] 2.4 Ensure the existing replay can report the new cases with per-rule outcomes, aggregate decisions, version/digest, model identity, repetitions, false blocks and unsafe allows; verify offline replay tests and live-opt-in refusal checks, without introducing a second runner.

## 3. Verification and handoff

- [x] 3.1 Run `bun test`, `bun run typecheck`, `bun run smoke`, `openspec validate generalize-rule-evaluation --strict` and `git diff --check`; record results and confirm no active policy, threshold, dependency or historical report changes.
- [x] 3.2 Record the live semantic validation disposition: only with separate owner authorization, run bounded replay without executing fixture actions and report results; otherwise explicitly record that live accuracy is unverified. Do not recommend adoption if bounded controls produce an unsafe allow.
- [x] 3.3 Write `docs/generalize-rule-evaluation-handoff.md` with the question version, verification evidence, remaining semantic risks, restart/rollback guidance and the pending-spec reconciliation warning; verify the handoff distinguishes offline contract results from live findings and names any skipped checks.
