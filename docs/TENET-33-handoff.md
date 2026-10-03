# TENET-33 handoff

Ordinary evidence can support PASS for reliably determinable complete-rule satisfaction without becoming authenticated applicability evidence. The question identity is now `policy-rules-v7-ordinary-evidence`; `applicability-v1` and enforcement gates are unchanged. Live semantic accuracy remains unverified.

Base: `1be20656152fe742ad56a69864e485c8207758ff`. This handoff belongs to the local TENET-33 integration commit. No push, PR or active-service restart is part of this slice.

## Contract and interfaces

- `src/decision/questions.ts` owns the generic clarification. Assess the entire invocation against each independent complete rule. Unsupported resolution and unrelated omissions alone do not require UNKNOWN/INSUFFICIENT. A rule's material gaps, opaque executable effects, ambiguous targets and unclear meaning still matter.
- Ordinary PASS retains its evidence assessment. Untrusted content remains data, not instructions, approval or executor guarantees. Tool descriptions cannot establish arbitrary executable effects.
- `src/decision/assessment-shape.ts` owns the new question identity. Question criteria, distributions, fact references, runtime profile, recording schema and metadata shapes are unchanged.
- Unsupported NOT_APPLICABLE is neither converted to PASS nor accepted as an exemption. Complete authenticated current facts, coverage, references, selected outcomes and freshness remain required. Integrity cannot select NOT_APPLICABLE or APPROVAL_REQUIRED.
- Thresholds and strict validation, aggregation, independent integrity, selected FAIL/UNKNOWN, WARN, current policy/target checks, invocation-local approval and observe/enforce consequences are unchanged.
- New request, assessment and owner metadata use the new question identity. Historical v6 and evidence-selection-v7 records retain recorded identities, original questions, scores and meaning without reevaluation or rewrite.

TENET-34 can consume the new question identity and unchanged assessment/profile interfaces. Compare recorded versions honestly; missing or historical evidence is not a current assessment. Scripted instruction/decision tests are not live semantic accuracy measurements. No evidence-retention or inspector-status interface changed here.

## Offline regressions

New scripted cases cover ordinary PASS with unsupported resolution, full-confidence unsupported applicability rejection, per-rule material gaps, opaque and forged effects, independent integrity, stale ordinary PASS, current owner metadata and fresh approval per invocation. Existing probability boundaries and decision/response controls remain executable.

The frozen TENET-29 campaign still refuses the current question contract before transport or output reservation. Restoring its mechanical coverage required separating production compatibility checking from the existing transport/journal/report implementation:

- `readFrozenEvidenceManifest` checks the existing byte pins and recorded consistency without rebuilding questions or selecting history.
- `prepareEvidenceManifest` additionally checks current model, question identity, thresholds, generated payloads and candidate selection. `runEvidenceLive` retains authorization and fixed-scope checks before entering the mechanics.
- `observeEvidenceCampaign` requires injected transport and an SDK adapter, with no default transport. Its mechanical body matches baseline after only those construction substitutions.
- `test/evidence-campaign-fixture.ts` supplies exact frozen payload bytes to mandatory fake transport. Scripted replies use the current SDK response validator and unchanged decision gates. It runs neither historical instructions nor fixture actions and is not a historical runtime evaluator.

All 15 skips were introduced during this task and were removed after the completion review. Their original assertions now execute: pinned manifest; sequential submission/accounting; supported fact replies; FAIL/UNKNOWN/ASK/integrity/invalid gates; HTTP rejection; 503 no-retry; ambiguous transport/re-entry; storage/output/intent limits; durable dispatch/checkpoint before transport and removed journal; cancellation/timeout; replaced journal; missing metadata/credential scrubbing; body-transfer failures; paired transitions with denominator 17; and mid-body cancellation. An additional regression requires transport and SDK adapter independently before output reservation. The campaign test file passes 21 tests with no skips.

Frozen files are unchanged:

| File | SHA-256 |
| --- | --- |
| `eval/evidence-selection/fixtures.json` | `6179d54bb77c588bb5e97b2631c4b6f77348eed840b0162a8d985ab15c5f8308` |
| `eval/evidence-selection/report.json` | `c181d801f886dd84d0f4ecb7e161e21dea53d1cb6c9ab1ac88c3763c7857257b` |
| `eval/evidence-selection/report.md` | `05a2bf3ba726313473e7f3faf3c97eecfc65a3a664a891308356b9ffb05e94dd` |

Current replay-report comparisons allow only question-derived identity, instruction text, digests and request-byte changes. Evidence/state, question shapes, validated assessments, decisions, gates, labels and denominators still match the authored mechanical baseline. Historical Markdown rendering remains identical.

## Verification and review

Final offline verification used cleared `TYPESAFE_API_KEY` and `TMPDIR=/tmp`, with builds before tests:

| Check | Result |
| --- | --- |
| `bun run sdk:build` | Pass |
| `bun run inspector:build` | Pass |
| `bun test --isolate --max-concurrency=1 --timeout=30000` | 836 pass, 0 skip, 0 fail; 84 files |
| `bun run typecheck` | Pass |
| `bun run inspector:check` | 0 errors, 0 warnings |
| `CI=1 bun run inspector:test` | 16 component + 27 browser tests pass |
| `bun run sdk:example` | Pass, offline under Node |
| `git diff --check` | Pass |

Focused verification passed 60 tests across the campaign, report, applicability-contract, decision and Jev files. The single fresh read-only completion reviewer requested changes for the earlier skipped snapshot. Its P1 coverage blocker is resolved by the executing scenarios above; P3 stale current-identity wording is updated in both active guides. No second reviewer was launched. The original review and case-by-case repair evidence are attached to TENET-33; they distinguish the reviewed snapshot from the owner's subsequent repair.

Earlier host-default long temporary paths caused unrelated Claude socket/byte-budget failures; unchanged tests pass with `/tmp`. An earlier inspector lifecycle timeout passed on isolated and complete reruns without source edits. The final complete checks above pass; live model behavior remains outside their coverage.

## Owner limits

Deployment requires an owner-controlled rebuild and process restart. Already-running processes keep their loaded question text. This task authorizes neither a live provider campaign nor an active-service restart. Do not relabel the frozen campaign to make it current. Rollback is restoration of the prior code revision and an owner-controlled restart, preserving policies and archives and never reusing approvals.
