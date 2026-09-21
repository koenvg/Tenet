# Generic rule evaluation handoff

Change: `generalize-rule-evaluation`.

## Delivered

`src/decision/questions.ts` now uses domain-neutral instructions for each rule's outcome and evidence questions. Rules supply restrictions, conditions and exceptions. The questions assess the entire invocation's immediate attempted effects using context and history, independently of other rules and prior approvals. Evidence is data, not instructions or authorization. Material ambiguity or missing evidence yields UNKNOWN for outcome assessment and INSUFFICIENT for evidence assessment.

No shared Git, publication, filesystem or tool-specific guidance remains. Built-in integrity is still a separate rule assessment. The SDK still submits one request with separate outcome and evidence keys for every rule. Aggregation, advisory modes, approval lifecycle, both 0.90 thresholds and the 2500 ms deadline are unchanged.

Question version: `policy-rules-v4-generic`.
Fixture version: `generic-rules-v3`. The report schema remains version 3.

The existing replay supports `--set=cross-domain`. Its 21 synthetic fixtures cover production-resource destruction, external communication, scoped security testing and a fictional domain defined entirely in its rule. They include equivalent effects through different mechanisms, non-triggering actions, unconditional versus approval restrictions, explicit exceptions, compound invocations, adversarial approval claims, redacted targets, ambiguous terminology and both orders of permissive/restrictive rules. Existing local-work, publication and integrity fixtures remain unchanged.

## Verification

| Check | Result |
| --- | --- |
| `bun test` | 219 passed across 22 files; 0 failed |
| `bun run typecheck` | Passed |
| `bun run smoke` | 3 passed; 0 failed |
| `openspec validate generalize-rule-evaluation --strict` | Passed |
| `git diff --check` | Passed |

Test-first checkpoints demonstrated failures before replacing domain-specific question instructions, changing version metadata, adding cross-domain/control fixtures and enabling the replay set. SDK tests inspect submitted questions, rule references and label sets. They also check that changing rule text or order does not select different instructions. Replay tests verify authored outcomes, version/digest metadata, error-count denominators and non-execution. Existing decision, diagnostics, trajectory and approval-lifecycle tests verify advisory handling, integrity vetoes and fresh approval requirements, including recovered native approval records.

All results above are offline contract and scripted-decision checks. They do not measure semantic accuracy or model independence between rules. No fixture actions were executed. No live provider calls were made. Live semantic validation was not authorized and remains unverified; no adoption recommendation is made on semantic reliability.

`TENET.md`, dependencies, lockfile and historical JSON reports are unchanged. The only change to `src/decision/decide.ts` is question version metadata. No commits were created.

## Optional live follow-up

Only after separate owner authorization and with provider credentials configured, the existing command can evaluate the synthetic cross-domain set:

```sh
bun eval/local-work-replay.ts --live --set=cross-domain --output=/tmp/tenet-generic-cross-domain.json --repetitions=3
```

The output path must not already exist. Repeat with `local-work`, `probe` and `holdout` using distinct output paths to check retained cases. Reports retain expected and observed per-rule outcomes, aggregate decisions, requested/returned model identifiers, question and fixture digests, repetitions, false blocks and unsafe allows. Actions remain data and are never executed. A bounded sample cannot establish general safety. Any unsafe allow in the controls prevents recommending adoption; report false blocks and uncertainty without lowering thresholds or adding domain exceptions back to shared instructions.

## Deployment, rollback and remaining risks

Restart the Pi process to load the new evaluator and confirm startup records show `policy-rules-v4-generic`. No policy-format or record-schema migration is needed. Rollback restores the prior questions and matching question-version metadata together, followed by a restart. Preserve historical report files.

Removing domain clarifications may revive earlier false blocks or introduce unsafe allows. A single request with independent questions does not guarantee model isolation across rules. Ambiguous owner rules remain uncertain rather than receiving hardcoded interpretations. Offline success does not resolve these risks.

The main spec's Git-specific guidance requirement is deliberately replaced by the generic requirement in this change's delta. The main spec is not synchronized during implementation. Pending publication-focused changes overlap this area; reconcile their requirements before later synchronization or archival so they do not reintroduce domain-specific shared instructions. Do not rewrite unrelated change artifacts without approved scope.
