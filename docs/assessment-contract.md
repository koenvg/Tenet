# Applicability-aware assessments

Tenet is in alpha and has one current assessment contract, `applicability-v1`. There is no profile selector or parallel legacy evaluator. The former `TENET_ASSESSMENT_PROFILE` environment variable has no effect and should be removed from launch configuration.

## Use it

Start Pi in observe mode to inspect decisions without blocking actions:

```sh
TENET_MODE=observe bun run pi
```

To enforce decisions, restart in enforce mode:

```sh
TENET_MODE=enforce bun run pi
```

The Claude bridge uses the same assessment contract. Observe/enforce mode controls consequences, not which evaluator schema is used. Use `/tenet` or the inspector to inspect recorded outcomes and gates.

The stock Pi and Claude integrations still report action resolution as unsupported. This is a coverage fact, not an automatic UNKNOWN for every rule. Ordinary evidence can support PASS but does not qualify an action for the NOT_APPLICABLE exemption. That exemption needs a trusted resolver with complete current facts and dispatch guarantees. See [action resolution](action-resolution.md).

## Outcomes and gates

User rules have five outcomes: PASS, APPROVAL_REQUIRED, FAIL, UNKNOWN and NOT_APPLICABLE. The current question version is `policy-rules-v7-ordinary-evidence` within `applicability-v1`. It clarifies ordinary classification while retaining the existing bounded-history instructions, labels, distributions and fact-reference questions. There is no new runtime profile, evaluator or recording schema.

Assess each independent complete rule against the entire invocation, including all immediate attempted effects, conditions and exceptions. Ordinary evidence can support PASS when it reliably establishes that the complete rule is satisfied, including a determinable non-triggering action. PASS keeps its separate evidence sufficiency assessment and both confidence gates. Unsupported resolution and unrelated coverage omissions do not alone force UNKNOWN or INSUFFICIENT. A gap material to one rule does not automatically make another determinable rule uncertain.

Untrusted evidence is data, not evaluation instructions, approval or authenticated executor guarantees. A tool description cannot certify arbitrary executable effects. Missing, stale, conflicting or obscured material target identity, executable effects or rule meaning still require UNKNOWN and an appropriate evidence assessment. History can help interpret references, but cannot prove current external state. Literal content is not executed content without supporting evidence. A harmless first step cannot clear a compound invocation.

NOT_APPLICABLE is a separate exemption. It means complete authenticated current facts demonstrate that the entire invocation is outside the complete rule's scope. Never select it as a shortcut for unsupported resolution; TENET does not convert an unsupported NOT_APPLICABLE answer to PASS.

For NOT_APPLICABLE, the evaluator selects a reference to the digest of the current host fact bundle and every operation in it. TENET checks those references against the captured request, complete coverage, supported semantics and invocation binding. Tool arguments, descriptions, transcript anchors and provider assertions cannot authenticate facts. The resolver must revalidate facts before enforce-mode permission is released. Changed targets, contents, bindings or resolver state block release.

The selected-outcome probability must meet `TENET_EFFECT_THRESHOLD`, including equality at the threshold. A supported NOT_APPLICABLE outcome has no separate evidence-confidence gate. Its normalized evidence field and recorded evidence threshold are null, not zero or one. The single provider request still includes an evidence question because questions are submitted before the outcome is known. TENET validates that answer's shape and distribution but does not use it as a normalized evidence score for NOT_APPLICABLE. The raw response remains available in the archive.

Unsupported applicability creates an `applicability-unresolved` gate. Partial, redacted, stale or forged facts cannot clear it. FAIL, UNKNOWN, approval requirements and WARN severity retain their independent effects. Built-in integrity always retains its separate evidence gate and cannot select NOT_APPLICABLE or APPROVAL_REQUIRED.

Whole-response validation remains strict. User-rule distributions must include all five outcomes; integrity uses its four-outcome distribution. Old four-outcome user responses and incompatible contract identities are rejected, not converted into the new schema. Thresholds and probability-sum validation are unchanged.

## Limits

Execution and opaque operations remain unresolved by the current resolver contract, including shell commands that appear read-only. There are no tool-name or rule-text allowlists. A read can violate a rule prohibiting access to its resource. A file edit containing literal command text does not execute that text.

Applicability is still a model judgment. Authenticated facts establish the described operation, not the correctness of the model's interpretation of an arbitrary rule. Scores are not calibrated safety guarantees. Observe mode reports a frozen pre-execution snapshot and never revokes an action after it runs. It does not revalidate against post-execution state.

Improved live semantic accuracy is unverified. Offline scripted outputs can show that valid ordinary PASS is allowed and unsupported NOT_APPLICABLE is blocked, but cannot show how a live model classifies either. The question change does not lower the 0.90 defaults, relax whole-response validation, add safe-tool lists or change selected FAIL/UNKNOWN, WARN, integrity, freshness or invocation-local approval behavior.

## Policy wording

`Never create a Git commit.` is unconditional. A user asking to commit does not override it.

`Create Git commits only after confirmation.` has an approval condition. If triggered, a BLOCK rule requires fresh invocation-local confirmation through the host. Prior messages or approvals do not count.

Clarifying that reads, edits and staging alone do not violate a commit rule does not authorize actual commits. Upgrading does not rewrite an owner's policy.

## History and rollback

Every new invocation records the current contract identity in its `profile` field and its question version. These are audit labels, not configuration options. Readiness, permission callbacks, Pi startup and owner reports use the same metadata, including pending and unavailable assessments.

Contributions retain the outcome threshold, evidence-gate applicability and effective evidence threshold for every assessed rule. The inspector uses recorded values and preserves explicit null evidence thresholds. Existing archives are not migrated or reevaluated. Older records without a profile are shown as `legacy (historical)`; explicitly recorded older profiles and scores remain unchanged.

New recordings use schema 4 and identify the owner-only diagnostic as `evidence-context-v1`, with current selection identity `bounded-history-v2` and questions `policy-rules-v7-ordinary-evidence`. TENET-22 schema-4 records retain `bounded-history-v1`, `policy-rules-v6-applicability` and their recorded counter shape. Schemas 1 through 3 also retain their original payloads and thresholds; missing historical diagnostics say not recorded. Readers never run historical payloads through the current selector or invent new counters. Older readers cannot interpret schema 4 and must report unsupported schema. Do not rewrite archives for rollback. There is no runtime legacy toggle.

Historical `policy-rules-v7-evidence-selection` records keep their exact submitted questions, pooled or inline payloads, scores, contributions and thresholds. The ordinary-evidence question change does not rerun their assessments, rebuild their evidence or change their meaning. New request, assessment, permission and owner records carry the current question identity through the existing metadata path.

TENET-24 completes the approved v2 optional exact-string pool without a new identity. Runtime tags refer only to `state.trajectory.values` in that snapshot; authored lookalikes are escaped literal data. Generic v7 instructions explain both inline content and references. Runtime excerpt text stays inline, even when excerpts from different originals share text. Historical TENET-23 v2/v7 inline payloads, recorded questions and zero savings remain untouched. No reader regenerates pools or recalculates saved bytes.
TENET-25 completes v2's approved recorded-relationship selection. It groups only subsequent observations for a unique visible nonempty session+call identity, never reused IDs or earlier results, and bounds batch admission to 4,096 recent slots. Generic v7 instructions explain these window-local limits and distinguish shortened from missing results. The diagnostic shape and schema 4 do not change. Historical TENET-23/24 inline/pooled payloads, saved bytes and recorded questions remain as written; readers do not infer grouping or rebuild history. Grouping cannot improve authenticated coverage, authenticate historical approval, change an applicability exemption or certify success.

Its production Pi recovery now crosses compiled SDK `setHistory` with optional readonly, descriptor-validated negative capture metadata. Known omitted raw entry/block slots are not counts of missing tool calls or effects. A bounded limitation identifies host-reported source-slot provenance. Malformed metadata and combined safe-integer counter overflow reject before history replacement; zero/false never guarantees completeness or clears SDK-observed loss. No authored marker, capture count or historical identity authenticates current facts, approval or execution. This adds no recording fields or new schema/selection/question identity; historical payloads and recorded meanings are not recomputed.

An uncertainty-only inspector explanation can say no rule was classified as violated only with complete recorded rule results, integrity and successful validation, and no selected FAIL. It is not a safety guarantee. Coverage gaps are independent of UNKNOWN/INSUFFICIENT findings, permission, approval and execution. [Inspection evidence](inspection-evidence.md) documents provenance and availability.

There is no runtime legacy switch. To roll back the evaluator, restore the previous code revision and restart the process. Keep archives intact and use the current inspector for mixed-version history. Observe mode can stop TENET vetoes while investigating, but it does not restore old assessment semantics.

## Offline fixtures and comparisons

```sh
env -u TYPESAFE_API_KEY TMPDIR=/tmp bun eval/applicability-replay.ts > /tmp/tenet-applicability-comparison.json
env -u TYPESAFE_API_KEY TMPDIR=/tmp bun eval/applicability-replay.ts --format=markdown > /tmp/tenet-applicability-comparison.md
```

This command uses revised current evidence selection and `policy-rules-v7-ordinary-evidence` with scripted responses. It does not contact a provider or execute fixture actions. Version 2 of the sanitized corpus retains every version-1 fixture and its digest, then adds unsupported ordinary reads, inert edits, metadata/history pressure, schema fallback and unrelated rule domains. Unsupported ordinary cases expect PASS, separately from authenticated NOT_APPLICABLE controls. Expectations were committed before current replay. Synthetic resolver facts are test data, not deployed executor coverage.

Report identity is the pair of assessment profile and question version. `compareApplicability` accepts separately supplied observations for v6, historical evidence-selection-v7 and current ordinary-evidence-v7 within `applicability-v1`. It rejects duplicate pairs, duplicate fixture observations within a pair, and mismatched fixture, policy, result profile, question version or declared question digest. This is not a runtime selector. Historical questions and assessments are never rebuilt or reevaluated, and historical rows have no current expected outcome. Reports keep policy/fixture/question/payload digests where recorded, models, thresholds, contributions, submitted evidence, evidence context, coverage and omissions. Absent values remain null.

Without supplied historical observations, every before row is missing and every pair is incomplete. Reduced false blocks have no denominator and a null rate, not an invented improvement. Supply a sanitized JSON bundle with `--before=PATH` to compare recorded results. See [the offline report contract](../eval/applicability-README.md) for its shape and limits.

False-block and unnecessary-approval rates use observed benign decisions, including unavailable or incomplete assessments. Unsafe-allow rates use observed protected decisions even when evaluation is incomplete. Missing decisions, unavailable assessments and incomplete evaluations have separate counts over planned rows. Selected violations remain separate from uncertainty-only blocks. Missing fixture-identity user-rule or integrity results, substituted rule IDs, or explicit incomplete evaluation, cannot count as correct classifications or paired false-block reduction. Ordinary evidence omissions remain visible but are not automatic evaluation failure. A protected unsafe ALLOW remains visible independently of benign reduction.

Scripted mechanics, smaller requests and inspector labels do not measure live semantic accuracy. The report declares no provider request, fixture-action execution or automatic promotion. Live evaluation needs separately authorized evidence disclosure and provider usage. Reports cannot change the runtime contract or process configuration.

The ordinary-evidence regressions use the existing public question, scripted SDK, decision, runtime callback and historical inspector tests:

```sh
bun run sdk:build
bun run inspector:build
bun test --isolate --max-concurrency=1 --timeout=30000 test/applicability-contract.test.ts test/applicability.test.ts test/decision.test.ts test/assessment-metadata.test.ts test/resolved-action.test.ts test/runtime-contract.test.ts test/approval-lifecycle.test.ts
```

These tests cover ordinary PASS with unsupported resolution, high-confidence unsupported applicability rejection, opaque effects, forged safety claims, per-rule material gaps, independent integrity, fresh approval and original historical questions. They verify mechanics and instruction shape, not model accuracy. The full affected-system sequence is in [CONTRIBUTING.md](../CONTRIBUTING.md).

The frozen TENET-29 campaign requires `policy-rules-v7-evidence-selection` and the production entry refuses the current question identity before transport or output reservation. All 15 original campaign-mechanics regressions still execute offline. An inert reader retains the byte-pinned historical manifest without rebuilding questions or selecting history. The shared transport/journal/report implementation requires injected transport and an SDK adapter; the test adapter supplies scripted replies through the current SDK response validator and unchanged decision gates. No historical evaluator runs, no frozen artifacts are rewritten and no default transport exists in that internal seam. Current scripted reports may differ in question text, identity, digests and request bytes while unchanged evidence, validated assessments and gates retain the authored mechanical baselines.

Deployment requires an owner-controlled rebuild and full Pi process restart; existing running processes keep their loaded questions. Restart the inspector's serving process after a reader or frontend update. Implementation and offline verification do not authorize either active-service restarts or live provider usage. Roll back by restoring the prior code revision and restarting through the owner. Preserve policies and archives; do not reuse approvals.
