# TENET-34 and TENET-30 owner handoff

The integrated change improves evidence retention, question guidance, report identity and execution-first presentation. Offline checks establish mechanics only. Live semantic improvement remains unverified.

## Fixed review base and integration

The combined completion review uses `1be20656152fe742ad56a69864e485c8207758ff`. The isolated TENET-34 worktree started clean at that commit. It integrated these local slices without conflicts:

- TENET-32, `02b58bbb338c5a3872b7d49dfb04f37cac9910ab`, as `e308497`.
- TENET-33, `20d716353da4a1208d75d29f22166ed80f8037e8`, as `850b3b7`.
- TENET-31, `4ba3a9cdc70b9636c0c968ef186fd6f3acdb73b8`, as `fd7bdcb`.

README and CONTRIBUTING changes retain all three slices' guidance. TENET-33's prior reviewer requested changes at an earlier snapshot. Its owner restored all 15 newly skipped campaign regressions and preserved the original assertions and frozen hashes. The combined reviewer checked the repaired snapshot and confirmed that all 15 scenarios execute with their original assertions. This does not claim earlier reviewer approval of that repair.

Authored sanitized corpus expectations were committed as `8e9946a` before new current replay. Version 2 has 29 cases. The 21 version-1 fixture identities and their corpus digest are unchanged. Eight new cases separate ordinary unsupported evidence from authenticated applicability and cover metadata/history pressure, schema fallback and unrelated rule domains. No raw archive source or credentials were imported.

## Contracts and reports

- Runtime profile remains `applicability-v1`.
- Current questions are `policy-rules-v7-ordinary-evidence`.
- Selection remains `bounded-history-v2`; owner diagnostics remain `evidence-context-v1`.
- Recording schema remains 4. Historical versions retain their recorded meanings.
- Report identity is profile plus question version. The report-only schema is `applicability-comparison-v2`; fixture corpus is `applicability-corpus-v2`.

The current replay uses the existing evidence and decision path with injected scripts. It retains finalized evidence, question and payload digests, models, thresholds, contributions, coverage and omissions where recorded. Missing values stay null. Historical observations are separately supplied data. No historical evaluator runs.

The default report shows all 29 historical rows as missing. No historical provider observations were supplied or invented. All pairs remain incomplete, and reduced false blocks have a null rate. This is a complete accounting report, not a measured before/after accuracy claim. Tests also supply inert version-qualified observations to exercise reduction, opposing changes, unavailable and incomplete rows, and protected unsafe ALLOWs.

False blocks, uncertainty-only blocks, selected violations, missing results, unavailable assessments, incomplete evaluations, unnecessary approvals and unsafe allows have separate counts and denominators. A protected unsafe ALLOW cannot disappear into a benign block reduction. Missing or incomplete pairs never earn classification or reduction credit. Scripted answers and smaller requests do not establish model accuracy.

Use [the offline comparison guide](../eval/applicability-README.md) for JSON and Markdown output and the separately supplied observation format. Live evaluation requires separate owner authorization for evidence disclosure and provider usage.

## Safety gates

Thresholds remain 0.90 with the same deadline, strict whole-response validation and probability checks. Selected FAIL/UNKNOWN, WARN, independent integrity, freshness, current invocation-local confirmation and observe/enforce consequences are unchanged. Unsupported NOT_APPLICABLE cannot become PASS or an authenticated exemption. Metadata retention does not authenticate effects. No tool exemption, runtime selector, writable inspector route, policy rewrite or archive migration was added.

Recorded BLOCK stays BLOCK in reports and archives. Ran is a neutral recorded result, not a policy all-clear. Release, approval and ALLOW do not prove execution; failure does not prove no external effects. Stock Pi and Claude resolution remains unsupported.

## Verification and review evidence

Exact commands, counts, review findings and repairs are in the attached TENET-34 result and combined review artifacts. SDK and inspector builds precede dependent tests. Verification uses no provider credentials, `TMPDIR=/tmp`, and only synthetic disposable archives and servers. The full offline Bun suite, type checks, inspector checks, desktop/narrow/polling browser regressions and Node SDK example are required. No campaign regression may be silently skipped to accommodate a new question identity.

Final post-repair checks pass: 211 focused tests across 14 files, 898 full Bun tests across 86 files, 31 inspector component tests, 39 built-app browser tests, both required builds, typecheck, inspector diagnostics with zero errors/warnings, offline Node SDK example and `git diff --check`. There are zero skips or failures. The reviewer independently ran 248 focused tests and 21 campaign tests at the earlier snapshot; post-repair counts come from the owner, not a second review.

The single fresh-context read-only completion review covers the complete integrated diff and all untracked files against the fixed base. Final task status depends on that gate and combined verification, not only comparison tests. No second reviewer is authorized.

The combined reviewer requested one P2 report fix. An arbitrary non-integrity rule could replace a missing expected user-rule result and receive completeness and reduction credit. The owner added a red regression for either comparison side, then bound completeness and outcome lookup to the fixture policy's exact user-rule ID and integrity ID. Missing expected IDs remain visible in `missingRuleIds`; such rows are incomplete and receive no classification or reduction credit. Protected unsafe ALLOWs remain visible even in those rows. Affected and whole-feature checks were rerun after repair. The original review and the owner's repair accounting are attached separately. No second review or claim of reviewer approval of the repaired snapshot is made.

## Owner deployment and rollback

No active install or serving process was changed. No provider request, fixture action, automatic promotion, push or PR was performed. Packaging was not required or run.

To load the verified code, the owner must separately authorize and perform the normal install/update, build the SDK and inspector, fully restart Pi for changed loaded questions and evidence code, and restart the inspector's serving process for changed reader code and assets. Rebuilding files alone does not update loaded processes. These are instructions only, not restart authorization.

For rollback, restore the prior code revision through the owner and rebuild/restart through the owner's normal process. Keep all policies and archives intact. Use a reader that supports mixed historical records and schema 4; do not relabel, repack or reevaluate archived evidence. Do not reuse approvals from previous invocations. Every required approval must remain fresh and invocation-local.
