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

The stock Pi and Claude integrations currently report action resolution as unsupported. The new contract alone does not exempt ordinary reads or edits. A host integration must register a trusted resolver with complete facts and dispatch guarantees. See [action resolution](action-resolution.md).

## Outcomes and gates

User rules have five outcomes: PASS, APPROVAL_REQUIRED, FAIL, UNKNOWN and NOT_APPLICABLE. The current question/response contract is `policy-rules-v7-evidence-selection`. It adds generic bounded-history excerpt/omission instructions; labels, distributions, fact authentication, validation, thresholds and gates remain `applicability-v1`.

NOT_APPLICABLE means current authenticated facts demonstrate that the entire invocation is outside the complete rule's scope. PASS means an applicable rule is satisfied. The evaluator must assess each complete rule independently. Material ambiguity stays UNKNOWN; a harmless operation cannot clear a compound invocation.

For NOT_APPLICABLE, the evaluator selects a reference to the digest of the current host fact bundle and every operation in it. TENET checks those references against the captured request, complete coverage, supported semantics and invocation binding. Tool arguments, descriptions, transcript anchors and provider assertions cannot authenticate facts. The resolver must revalidate facts before enforce-mode permission is released. Changed targets, contents, bindings or resolver state block release.

The selected-outcome probability must meet `TENET_EFFECT_THRESHOLD`, including equality at the threshold. A supported NOT_APPLICABLE outcome has no separate evidence-confidence gate. Its normalized evidence field and recorded evidence threshold are null, not zero or one. The single provider request still includes an evidence question because questions are submitted before the outcome is known. TENET validates that answer's shape and distribution but does not use it as a normalized evidence score for NOT_APPLICABLE. The raw response remains available in the archive.

Unsupported applicability creates an `applicability-unresolved` gate. Partial, redacted, stale or forged facts cannot clear it. FAIL, UNKNOWN, approval requirements and WARN severity retain their independent effects. Built-in integrity always retains its separate evidence gate and cannot select NOT_APPLICABLE or APPROVAL_REQUIRED.

Whole-response validation remains strict. User-rule distributions must include all five outcomes; integrity uses its four-outcome distribution. Old four-outcome user responses and incompatible contract identities are rejected, not converted into the new schema. Thresholds and probability-sum validation are unchanged.

## Limits

Execution and opaque operations remain unresolved by the current resolver contract, including shell commands that appear read-only. There are no tool-name or rule-text allowlists. A read can violate a rule prohibiting access to its resource. A file edit containing literal command text does not execute that text.

Applicability is still a model judgment. Authenticated facts establish the described operation, not the correctness of the model's interpretation of an arbitrary rule. Scores are not calibrated safety guarantees. Observe mode reports a frozen pre-execution snapshot and never revokes an action after it runs. It does not revalidate against post-execution state.

The move to one contract was explicitly authorized for the alpha. It is not evidence of improved live model accuracy. No live evaluator validation or automatic promotion is implied.

## Policy wording

`Never create a Git commit.` is unconditional. A user asking to commit does not override it.

`Create Git commits only after confirmation.` has an approval condition. If triggered, a BLOCK rule requires fresh invocation-local confirmation through the host. Prior messages or approvals do not count.

Clarifying that reads, edits and staging alone do not violate a commit rule does not authorize actual commits. Upgrading does not rewrite an owner's policy.

## History and rollback

Every new invocation records the current contract identity in its `profile` field and its question version. These are audit labels, not configuration options. Readiness, permission callbacks, Pi startup and owner reports use the same metadata, including pending and unavailable assessments.

Contributions retain the outcome threshold, evidence-gate applicability and effective evidence threshold for every assessed rule. The inspector uses recorded values and preserves explicit null evidence thresholds. Existing archives are not migrated or reevaluated. Older records without a profile are shown as `legacy (historical)`; explicitly recorded older profiles and scores remain unchanged.

New recordings use schema 4 and identify the owner-only diagnostic as `evidence-context-v1`, with current selection identity `bounded-history-v2` and questions `policy-rules-v7-evidence-selection`. TENET-22 schema-4 records retain `bounded-history-v1`, `policy-rules-v6-applicability` and their recorded counter shape. Schemas 1 through 3 also retain their original payloads and thresholds; missing historical diagnostics say not recorded. Readers never run historical payloads through the current selector or invent new counters. Older readers cannot interpret schema 4 and must report unsupported schema. Do not rewrite archives for rollback. There is no runtime legacy toggle.

An uncertainty-only inspector explanation can say no rule was classified as violated only with complete recorded rule results, integrity and successful validation, and no selected FAIL. It is not a safety guarantee. Coverage gaps are independent of UNKNOWN/INSUFFICIENT findings, permission, approval and execution. [Inspection evidence](inspection-evidence.md) documents provenance and availability.

There is no runtime legacy switch. To roll back the evaluator, restore the previous code revision and restart the process. Keep archives intact and use the current inspector for mixed-version history. Observe mode can stop TENET vetoes while investigating, but it does not restore old assessment semantics.

## Offline fixtures and comparisons

```sh
bun eval/applicability-replay.ts > /tmp/tenet-applicability-comparison.json
```

This command exercises only the current contract with scripted responses. It does not contact a provider or execute fixture actions. Frozen, sanitized canonical and held-out expectations live in `eval/applicability-fixtures.ts`, with a version and pinned digest test. The synthetic resolver is test data, not proof that a deployed host supports these operations.

`compareApplicability` can compare separately supplied recorded results for declared contract identities. It does not rerun historical evaluators or reconstruct absent contributions. Reports retain fixture and policy digests, profile/question identities, thresholds, recorded contributions, returned model, evidence coverage and omissions.
Semantic-label comparisons apply only to the current contract's authored expectations. Older contracts retain their labels and participate in operational decision metrics without being reinterpreted under the new schema.

False-block and unnecessary-approval rates use observed decisions on benign fixtures, including unavailable or incomplete assessments. Unsafe-allow rates use observed decisions on protected fixtures. Missing decisions are counted separately; an empty denominator produces a null rate, never zero. Missing or unavailable assessments are not semantic successes, and operational failures cannot hide recorded BLOCK, ASK or unsafe ALLOW outcomes.

Scripted results verify mechanics, not semantic accuracy. Live replay requires separate explicit owner authorization. Reports cannot change the runtime contract or process configuration.
