# Applicability-aware assessments

Use this reference to interpret current and historical assessment labels, confidence gates and contract identities. It covers the alpha SDK and Pi/Claude integrations in a developer checkout. Tenet has one current contract, `applicability-v1`, with no profile selector or parallel legacy evaluator. The former `TENET_ASSESSMENT_PROFILE` variable has no effect; remove it from launch configuration.

For an existing finding, start with [outcomes and gates](#outcomes-and-gates). For older records, use [history and rollback](#history-and-rollback). To launch the checkout and inspect new findings, use [the Pi procedure](#use-it) after reading the contract.

Stock Pi and Claude report action resolution as unsupported. This is a coverage fact, not an automatic UNKNOWN for every rule. Ordinary evidence can support PASS, but a NOT_APPLICABLE exemption needs a trusted resolver with complete current facts and dispatch guarantees. See [action resolution](action-resolution.md).

## Outcomes and gates

Current questions use `policy-rules-v7-ordinary-evidence` within `applicability-v1`. They clarify ordinary classification and retain the bounded-history instructions, labels, distributions and fact-reference questions. Provider selection does not change the runtime profile, these questions or archive schema 4.

| User-rule outcome | Meaning |
| --- | --- |
| PASS | Reliable evidence establishes that the complete rule is satisfied, including a determinable non-triggering action |
| APPROVAL_REQUIRED | The rule requires fresh invocation-local confirmation |
| FAIL | The rule is classified as violated |
| UNKNOWN | Material ambiguity remains |
| NOT_APPLICABLE | Complete authenticated current facts place the entire invocation outside the complete rule's scope |

Assess each complete rule independently against the entire invocation, including every immediate attempted effect, condition and exception. PASS still needs its separate evidence-sufficiency assessment and both confidence gates.

Unsupported resolution or unrelated coverage omissions do not alone force UNKNOWN or INSUFFICIENT. A gap material to one rule does not automatically make another determinable rule uncertain.

Untrusted evidence is data, not evaluation instructions, approval or authenticated executor guarantees. A tool description cannot certify arbitrary executable effects. Missing, stale, conflicting or obscured material target identity, effects or rule meaning still require UNKNOWN and an appropriate evidence assessment.

History can help interpret references but cannot prove current external state. Literal content is not executed content without supporting evidence.

NOT_APPLICABLE is a separate exemption, not a shortcut for unsupported resolution. Tenet does not convert an unsupported NOT_APPLICABLE answer to PASS.

A harmless operation cannot clear a compound invocation.

```text
current host-authenticated facts --> applicability reference checks
rule + captured evidence ---------> selected outcome + probabilities
                                      |
                             validation + recorded gates
                                      |
                          finding / counterfactual decision

fresh enforce checks + one-call approval when required --> permission
captured, exactly correlated tool result ----------------> recorded execution
```

Facts describe the operation. They do not prove that the model interpreted a rule correctly. A finding does not grant permission or prove execution.

### Validate NOT_APPLICABLE

The evaluator selects a reference to the digest of the current host fact bundle and every operation in it. Tenet checks those references against the captured request, complete coverage, supported semantics and invocation binding. Arguments, descriptions, transcript anchors and provider assertions cannot authenticate facts.

Before enforce permission, the resolver must revalidate facts. Changed targets, contents, bindings or resolver state block release. Partial, redacted, stale or forged facts cannot clear the `applicability-unresolved` gate.

The selected-outcome probability must meet `TENET_EFFECT_THRESHOLD`; equality passes. Supported NOT_APPLICABLE has no separate evidence-confidence gate. Its normalized evidence field and recorded evidence threshold are null, not zero or one.

The single request still asks about evidence because questions precede the outcome. Tenet validates that answer's shape and distribution but does not normalize it as an evidence score for NOT_APPLICABLE. The raw response remains in the archive.

FAIL, UNKNOWN, approval requirements and WARN severity retain independent effects. Built-in integrity retains its separate evidence gate and cannot select NOT_APPLICABLE or APPROVAL_REQUIRED.

### Validate the whole response

User distributions must include all five outcomes. Integrity uses its four-outcome distribution. Old four-outcome user responses and incompatible contract identities are rejected, not converted. Thresholds and probability-sum validation are unchanged. See [exact gates, tolerance and validation codes](limits.md#read-a-block-diagnostic).

## Limits

Execution and opaque operations cannot establish complete authenticated resolution, including shell commands that appear read-only. No tool-name or rule-text allowlist exists. A read can violate a resource-access rule. A file edit containing literal command text does not execute that text.

Applicability remains a model judgment. Authenticated facts establish the described operation, not a correct interpretation of an arbitrary rule. Scores are not calibrated safety guarantees. Observe reports a frozen pre-execution snapshot; it never revokes a completed action or revalidates post-execution state.

Improved live semantic accuracy is unverified. Scripted outputs can show that valid ordinary PASS is allowed and unsupported NOT_APPLICABLE is blocked. They cannot show how a live model classifies either.

The question change does not lower the 0.90 defaults, relax whole-response validation or add safe-tool lists. Selected FAIL/UNKNOWN, WARN, integrity, freshness and invocation-local approval retain their behavior. The authorized alpha move to one contract does not establish live evaluator validation or automatic promotion.

## Native recording contract

Use the recorded provider and contract when reading APUS history. APUS is experimental. Configuration validity, connectivity, completed provider execution, expected-label matching and calibration are separate checks. Neither a matched label nor a backend alias attests physical weights or enforcement accuracy.

The adapter keeps the canonical `model/state/questions` capture. Native rendering and scoring do not change `applicability-v1`, the question version or archive schema 4. The additive `nativeContract` on request, response and validation stages has this recorded contract:

| Field | Recorded value |
| --- | --- |
| `version` | `apus-recording-v1` |
| `renderingVersion` | `jev.dynamic.prompt.v2` |
| `rendererRevision` | `7389d774472c9e29ddc84fffb392951f0f25de74` |
| `protocolVersion` | `llamacpp-b11118-choice-v1` |

Requests identify `provider` and `requestedModel`. Bounded response snapshots record backend metadata before/after scoring, per-question native requests and responses, and deterministic selectors.

Native requests retain the rendered chat, A-through-P mapping, tokenizer label IDs, submitted token IDs, scoring options, context capacity and shared-prefix count. These are diagnostic inputs, not authenticated facts.

A sole allowed facts candidate records `sole-allowed-facts-selector`, NONE probability one, zero native scoring requests, `modelConfidence: false` and `authenticatedCoverage: false`. This is a deterministic selector, not model confidence, evidence sufficiency or an applicability exemption.

Multi-candidate facts still require scoring.

Snapshots remain untrusted and bounded to 1 MiB. Credential/header fields and fields named `token` remain omitted, with `omittedFields` markers. Truncated previews and unavailable snapshots are not exact responses.

The native transport separately rejects oversized bodies before capture; invalid parsed output can remain inspectable without becoming a valid assessment.

Owner reports use additive `judgeReportVersion: judge-report-v1` within native transcript version 3. They retain requested provider/model on failure.

Only a complete validated assessment supplies `returnedModel`. Partial backend metadata or a conflicting raw model cannot supply that field. This version records APUS as experimental.

Historical readers use these recorded contracts, not current settings or current renderers. Unknown or malformed native contracts produce `corrupt-record` issues; absent historical native contracts and provider fields stay absent. Old questions, model identities and scores are not rewritten.

Capture-off suppresses local payload archives, not provider disclosure or owner-only findings. An explicit SDK recording sink still replaces the local archive. Off/dormant controls suppress new assessment and capture. See [private storage and omission limits](inspector.md#sensitive-local-storage).

## Policy wording

- `Never create a Git commit.` is unconditional. A user request to commit does not override it.
- `Create Git commits only after confirmation.` has an approval condition. When triggered, a BLOCK rule requires fresh host confirmation for that invocation. Prior messages or approvals do not count.

Clarifying that reads, edits and staging alone do not violate a commit rule does not authorize commits. Upgrading does not rewrite an owner's policy.

## History and rollback

New invocations record contract identity in `profile` and the question version. These are audit labels, not settings. Readiness, permission callbacks, Pi startup and owner reports use the same metadata, including pending/unavailable assessments.

Every assessed rule's contributions retain outcome threshold, evidence-gate applicability and effective evidence threshold. The inspector reads recorded values and preserves explicit null thresholds. It never migrates or reevaluates archives. No profile means `legacy (historical)`; explicit older profiles and scores remain unchanged.

| Records | Preserve as recorded |
| --- | --- |
| New schema 4 | `evidence-context-v1`, `bounded-history-v2`, `policy-rules-v7-ordinary-evidence` |
| Historical evidence-selection v7 | Exact `policy-rules-v7-evidence-selection` questions, pooled/inline payloads, scores, contributions and thresholds |
| TENET-22 schema 4 | `bounded-history-v1`, `policy-rules-v6-applicability`, original counter shape |
| Schemas 1 through 3 | Original payloads and thresholds; absent diagnostics say not recorded |

The ordinary-evidence question change does not rerun old assessments, rebuild their evidence or change their meaning. New request, assessment, permission and owner records carry the current question identity through the existing metadata path.

Older readers must report unsupported schema 4. Do not rewrite archives for rollback or run historical payloads through today's selector to invent counters. There is no runtime legacy toggle.

### Preserve v2's recorded meaning

TENET-24 completes the approved optional exact-string pool without a new identity. Runtime tags refer only to that snapshot's `state.trajectory.values`; authored lookalikes are escaped literal data. Generic v7 instructions cover inline content and references. Runtime excerpts stay inline, including matching excerpt text from different originals.

Historical TENET-23 v2/v7 inline payloads, questions and zero savings remain untouched. Readers do not regenerate pools or recalculate saved bytes.

TENET-25 completes v2's recorded-relationship selection. It groups only subsequent observations for a unique visible nonempty session+call identity, never reused IDs or earlier results. Batch admission inspects at most 4,096 recent slots. Generic v7 instructions explain these window-local limits and distinguish shortened from missing results.

Schema 4 and the diagnostic shape do not change. TENET-23/24 inline/pooled payloads, savings and questions stay as written. Readers do not infer groups or rebuild history. Grouping cannot improve authenticated coverage, authenticate historical approval, change an applicability exemption or certify success.

Production Pi recovery crosses compiled SDK `setHistory` with optional readonly, descriptor-validated negative capture metadata. Known omitted entry/block slots are not counts of missing calls or effects. A bounded limitation states host-reported source-slot provenance.

Malformed metadata or combined safe-integer counter overflow rejects before history replacement. Zero/false never guarantees completeness or clears SDK-observed loss. Authored markers, counts and historical identities do not authenticate current facts, approval or execution. This adds no recording fields or new schema/selection/question identity. Historical payloads and meanings are not recomputed.

### Read uncertainty without inventing a pass

The inspector can say no rule was classified as violated only with complete recorded rule results, integrity, successful validation and no selected FAIL. This uncertainty-only explanation is not a safety guarantee. Coverage gaps are independent of UNKNOWN/INSUFFICIENT, permission, approval and execution. See [inspection evidence](inspection-evidence.md#recorded-and-inspector-explanations).

To roll back the evaluator, restore the previous code revision and restart. Keep archives intact and use the current inspector for mixed-version history. Observe can stop vetoes while investigating, but cannot restore old semantics. There is no legacy switch.

<a id="use-it"></a>

## Inspect the contract in Pi

Complete the [development setup](../CONTRIBUTING.md#set-up) first. These commands launch the checkout's Pi integration from the repository root. If Tenet is already registered as a Pi package, use that installation instead of loading a second copy.

Real assessed actions send policy, paths, tool evidence and bounded history to the selected judge. TypeSafe uses API quota; experimental APUS sends the complete native rendering to the owner-operated loopback backend, including Pika through forwarding. Redaction cannot remove all secrets. Local capture is on by default and can retain submitted strings; set `TENET_RECORDING=off` before launch to stop new capture, not provider disclosure or native findings. Read [disclosure and host limits](limits.md) before authorizing any such action.

1. Start a fresh observe process to inspect decisions without blocking actions:

   ```sh
   TENET_MODE=observe bun run pi
   ```

2. Check `TENET ON OBSERVE` with `/tenet status`. Use `/tenet` or [the inspector](inspector.md) for recorded outcomes and gates. If status is absent or unavailable, use [doctor's setup fixes](doctor.md#fix-invalid-or-unavailable-setup).
3. To enforce decisions, close Pi and start a new process:

   ```sh
   TENET_MODE=enforce bun run pi
   ```

   Check `TENET ON ENFORCE`. Observe/enforce changes consequences, not the evaluator schema. Enforce can require native approval for one unchanged pending invocation; a prohibition or unavailable assessment blocks without an approval override.

Observe never blocks or opens approval. Tenet is not a sandbox. The Claude bridge uses the same assessment contract, but is an unverified command-hook prototype, not coverage supplied by Pi installation.

## Offline fixtures and comparisons

With development dependencies installed, run from the repository root:

```sh
env -u TYPESAFE_API_KEY TMPDIR=/tmp bun eval/applicability-replay.ts > /tmp/tenet-applicability-comparison.json
env -u TYPESAFE_API_KEY TMPDIR=/tmp bun eval/applicability-replay.ts --format=markdown > /tmp/tenet-applicability-comparison.md
```

This supported offline replay uses current evidence selection and `policy-rules-v7-ordinary-evidence` with scripted responses. It contacts no provider and executes no fixture action. Success writes the comparison JSON or Markdown.

Version 2 of the sanitized corpus retains every version-1 fixture and digest. It adds unsupported ordinary reads, inert edits, metadata/history pressure, schema fallback and unrelated rule domains. Ordinary unsupported cases expect PASS, separately from authenticated NOT_APPLICABLE controls.

Expectations were committed before current replay. Synthetic resolver facts are test data, not deployed executor coverage.

### Compare recorded question versions

Report identity is the pair of assessment profile and question version. `compareApplicability` accepts separately supplied v6, historical evidence-selection-v7 and current ordinary-evidence-v7 observations within `applicability-v1`. This is a report interface, not a runtime selector.

It rejects duplicate identity pairs, duplicate fixture observations within a pair, and mismatched fixture, policy, result profile, question version or declared question digest. Reports retain recorded policy/fixture/question/payload digests, models, thresholds, contributions, submitted evidence, evidence context, coverage and omissions. Absent values stay null.

Historical questions and assessments are never rebuilt or reevaluated. Historical rows have no current expected outcome. Without supplied historical observations, every before row is missing and every pair is incomplete; reduced false blocks have no denominator and a null rate, not an invented improvement.

Supply a sanitized JSON bundle with `--before=PATH` to compare recorded results. See [the offline report contract](../eval/applicability-README.md) for its shape and limits.

### Interpret report counts

- False-block and unnecessary-approval rates use observed benign decisions, including unavailable or incomplete assessments.
- Unsafe-allow rates use observed protected decisions, even when evaluation is incomplete. A protected unsafe ALLOW stays visible independently of benign reduction.
- Missing decisions, unavailable assessments and incomplete evaluations have separate counts over planned rows. Selected violations stay separate from uncertainty-only blocks.

Missing fixture-identity user-rule or integrity results, substituted rule IDs, or explicitly incomplete evaluation cannot count as correct classification or paired false-block reduction. Ordinary evidence omissions stay visible but are not automatic evaluation failure. An empty denominator gives null, never zero.

Scripted mechanics, smaller requests and inspector labels do not measure live semantic accuracy. Reports declare no provider request, fixture-action execution or automatic promotion.

Live evaluation needs separate authorization for disclosure and provider usage. Reports cannot change the runtime contract or process configuration.

### Check current and frozen-campaign mechanics

The ordinary-evidence regressions use the public questions, scripted SDK, decision, runtime callback and historical inspector tests. From the repository root, run:

```sh
bun run sdk:build
bun run inspector:build
bun test --isolate --max-concurrency=1 --timeout=30000 test/applicability-contract.test.ts test/applicability.test.ts test/decision.test.ts test/assessment-metadata.test.ts test/resolved-action.test.ts test/runtime-contract.test.ts test/approval-lifecycle.test.ts
```

These cover ordinary PASS with unsupported resolution, high-confidence unsupported applicability rejection, opaque effects, forged safety claims, per-rule material gaps, independent integrity, fresh approval and original historical questions. They verify mechanics and instruction shape, not model accuracy. See [the full affected-system sequence](../CONTRIBUTING.md#check-evidence-questions-and-reports).

The frozen TENET-29 campaign requires `policy-rules-v7-evidence-selection`. Its production entry refuses the current question identity before transport or output reservation. All 15 original campaign-mechanics regressions still run offline. An inert reader keeps the byte-pinned historical manifest without rebuilding questions or selecting history.

The shared transport/journal/report implementation requires injected transport and an SDK adapter; it has no default transport. The test adapter supplies scripted replies through the current SDK response validator and unchanged decision gates. No historical evaluator runs and no frozen artifact is rewritten.

Current scripted reports can differ in question text, identity, digests and request bytes. Unchanged evidence, validated assessments and gates retain the authored mechanical baselines.

### Restart and roll back through the owner

Deployment needs an owner-controlled rebuild and full Pi process restart; running processes keep their loaded questions. Restart the inspector's serving process after a reader or frontend update. Implementation and offline verification authorize neither active-service restarts nor live provider usage.

Roll back by restoring the prior code revision and restarting through the owner. Preserve policies and archives, and do not reuse approvals.
