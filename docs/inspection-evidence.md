# Inspection evidence preparation

Use this developer-checkout reference to check evidence budgets, recorded coverage and historical payload meaning. It describes SDK, Pi and Claude preparation/reporting, not a permission or execution guarantee. For owner tasks, start with [the inspector guide](inspector.md).

Choose the part you need:

- [Budgets](#check-the-budgets) and [group selection](#recorded-groups-and-bounded-batch-admission).
- [Exact string representation](#exact-string-representation), including literal escapes and historical payloads.
- [Owner diagnostics](#runtime-evidence-context) and [inspector explanations](#recorded-and-inspector-explanations).
- [Historical regression evidence](#regression-seams) and [the final offline comparison](#final-offline-comparison-and-epic-verification).

## Shared contract

`src/decision/history-selection.ts` owns admission, immutable snapshots and the single current group selector. Live/recovered `Observations.add` and SDK `addHistory` share it with these modules:

- `history-envelope.ts` reads own data descriptors, validates primitive identities/timestamps and bounds envelopes before content access.
- `history-content.ts` provides descriptor-only bounded normalization, excerpts, literal escaping and exact string pooling.

Recovery adapters choose branch eligibility and provenance, not content selection. The SDK checks readiness/activation before replacing history.

`boundEvidence` calls `prepareRequest` with the byte measurement of the exact `judgeState` projection. Policy, integrity, host context, pending arguments and current resolved facts are protected. Optional current tool description/schema can be removed under total-state pressure.

Protected facts are never truncated. If they or the minimal history envelope cannot fit, `decide` returns conservative `BLOCK / insufficient-evidence` without calling the judge. Observe still permits independently of that counterfactual decision.

See [current-evidence priority](action-resolution.md#fit-current-evidence-before-history) for metadata tiers, final-only omission counts and overflow behavior.

### Check the budgets

| Budget | Exact bound |
| --- | --- |
| Default recent events, `TENET_RECENT_EVENTS` | `12` |
| Default serialized state, `TENET_EVIDENCE_MAX_BYTES` | `24576`, 24 KiB |
| History allowance | `min(floor(maxBytes / 3), remaining bytes after protected current evidence)` |
| Complete retained event `data` envelope | `floor(historyAllowance / 4)` |
| Default maximum history / event | 8 KiB / 2 KiB |
| Normalization per content root | 4,096 nodes, depth 64, 24 KiB structural material |
| Batch admission work | 4,096 recent slots |

History bytes include the complete trajectory, observation envelopes, omission/excerpt metadata and selection summary. The event cap includes its complete `data`, not just text. Unused history capacity never enlarges an event.

Admission applies the same one-third/one-quarter bounds before current evidence is available. Final preparation only tightens them. Selection bounds expanded content and escapes literals before pooling. It prefers newer recorded groups, keeps members distinct and restores ingestion order.

Zero recent events reads no slots. It submits no observations or values pool, but retains the bounded envelope and aggregate omissions. If that envelope cannot fit a tiny cap, preparation fails conservatively.

Before copying, normalization visits only own data descriptors, never authored getters. Sparse, circular, image, unsupported and oversized structures receive explicit omissions. It uses current-action credential/configured-field redaction. Large strings can be excerpted without copying their full contents. Retained SDK/live/recovered data uses the same bounds.

## Recorded groups and bounded batch admission

### Identify a recorded group

`history-groups.ts` uses bounded primitive session/call identity, structural origin and ingestion position. An origin ending in `-tool-call` marks a call boundary. Payload keys, tool names and timestamps do not.

A nonempty session+call key pairs only if exactly one call is visible in the inspected window. That call and later matching non-call observations form a group. Earlier results stay independent singletons.

No visible call, null/empty identity, unknown session or multiple call boundaries leaves observations as singletons. Equal IDs in different sessions never pair. Failures, contradictory results and repeated attempts keep distinct envelopes.

Private ambiguity provenance survives copies and tightening. Dropping an earlier duplicate cannot make its surviving attempt silently unique. This provenance is not serialized authentication and cannot describe an uninspected prefix.

### Select and tighten groups

1. Rank groups by their latest member's ingestion position, newest first.
2. Greedily keep whole groups within `recentEvents`, then normalize only those payloads. A group larger than the ceiling is omitted whole, even with spare slots. An unrepresentable member data envelope drops its whole group.
3. Under byte pressure, uniformly halve expanded-content allowances, including runtime loss metadata, down to the smallest representable values. If values/envelopes still do not fit, drop the oldest selected group whole.
4. Restore surviving observations to ingestion order, not timestamp order.

Recorded `maxEventBytes` is an upper bound, not a promise that each event uses it. Tightening can remove complete-string pool eligibility. Rebuild the pool, eligible occurrences and exact savings for every candidate and after every eviction. Reference encoding must not change reconstructed retained values.

### Bound SDK and raw-trajectory scans

SDK history and unknown raw final-preparation trajectories inspect only the last 4,096 candidate array slots, even with a larger `recentEvents`. Invalid, sparse and accessor slots spend scan work; own data descriptors reject them without invoking getters. No excluded prefix is inspected.

Known prefix slots and malformed scanned envelopes count as prior admission/capture omissions. `history-admission-window` describes the known slot count, not valid evidence or related execution. Valid observations excluded by count/bytes are selector drops. Zero history retains input-length selector drops and makes no admission-window claim.

### Bound selected-branch Pi recovery

`nativeHistory` admits only `tool-call` and `tool-result` observations. It correlates call IDs with same-session Tenet records in the inspected window, in mode `observe` or `enforce`. Admission requires `permission` with a string `wouldDecision`, or `assessment-status` with status `completed`. Findings, decision records and consent never become tool evidence. Owner-report restoration is separate.

Recovery walks branch entries and assistant content blocks backwards within one shared 4,096-slot work allowance, then restores eligible candidate order. Entry and nested block slots both spend the allowance.

Known uninspected entry/block prefixes contribute admission omissions. Recovery does not scan them to count hypothetical eligible calls. This work budget is separate from each content root's 4,096-node/depth-64 checks. No unconditional whole-trajectory structural guard or runtime switch is added.

The production translator is `src/pi/history.ts`, called by `registerGuard`, not a test-only translator. It discovers assessed IDs only in the inspected window, restores tool-event order and calls compiled SDK `setHistory(history, capture?)`.

The optional readonly `capture` argument has only fixed own data fields `priorOmittedEvents` and `admissionLimited`. Malformed fields/accessors reject atomically. Every combined loss counter must remain a safe integer before history replacement. This avoids source-only weak-map dependence across compiled module identities.

Host counts add negative coverage, not authenticated facts. `host-reported-capture-slots-not-tool-event-counts` states their source-slot provenance. A skipped entry can have unknown nested blocks and eligible events; only its known entry slot counts. Inspected invalid slots and known excluded blocks count separately.

Zero known eligible events or zero/false metadata does not imply complete capture. SDK-detected gaps/window limits cannot be lowered or cleared. Event-data lookalikes remain literal. Retained/shortened counts describe emitted observations; omission counters can describe known source slots, not all missing calls/effects.

Zero Pi history reads no entry/block slots and drops the known branch input length without a window claim. Owner-report restoration is separate from evaluator-history preparation.

### Do not infer execution from grouping

SDK/recovery batches no longer discard a call only because its late interleaved result falls outside an individual-event pre-slice. Incremental live history stays bounded and cannot restore a call/result lost before a sibling arrives. A late result without a retained call stays unpaired.

Uniqueness is window-local recorded identity, not proof of complete capture, execution or success. A shortened result remains an observation with explicit loss; a missing result stays unknown. Neither grants permission or authenticates current effects. Grouping adds no rule-materiality label or evaluator rationale.

### Excerpt representation

Small sanitized values stay literal in `observation.data.content`. A runtime excerpt replaces a string with `{"tenetExcerpt":{"head":"...","tail":"..."}}`. The runtime-owned outer `observation.data.selection.excerpts` records path, original UTF-8 size and two half-open retained byte ranges.

Head/tail end at Unicode boundaries. Missing middle, JSON escaping and all metadata count against the byte cap. Later tightening preserves original size/offsets; it cannot call an earlier excerpt complete. `data.selection.omissions` gives structural-loss paths/reasons without guessing unknown original sizes.

Only paths in the runtime-owned outer selection identify generated loss. Authored lookalikes stay literal in `data.content`, with no selector authority or private gap provenance. Private weak maps preserve normalization gaps/excerpt provenance across immutable copies; they are not serialized. Representation metadata describes missing content, not authenticated facts.

Each final trajectory records `selection.version: bounded-history-v2`, effective history/event allowances, retained/shortened counts, selector drops, prior capture omissions and `exactCompactedBytes`.

That savings counter compares actual compact JSON with the same retained escaped-inline snapshot and identical selection metadata. It includes values envelope, keys, references, escaping and UTF-8 bytes. It excludes excerpt savings, event drops and avoided admission loss. TENET-23 inline records retain zero.

`trajectory.omitted` equals dropped plus prior omissions. Content loss inside a retained event is not whole-event omission. Missing content proves neither execution nor success.

Order is ingestion or selected-branch order, not timestamps. Deeply frozen copies are detached from host content. Later siblings cannot change an in-flight request, and final preparation does not mutate admission snapshots. Ownership/lifecycle invalidation is unchanged.

## Exact string representation

Complete sanitized historical strings of at least 256 serialized UTF-8 bytes can use `{"tenetHistory":{"ref":"v0"}}` in `observation.data.content`. Store the string once at `state.trajectory.values.v0`. The optional pool has at most 256 entries.

IDs follow deterministic first-eligible-value order within the retained snapshot, not hashes or original secret-bearing values. Equality is exact after redaction. Short strings, non-string structure and nonidentical strings remain distinct. Never pool or collapse event envelopes.

### Escape authored tags

Every authored object with its own `tenetHistory` key is encoded as `{"tenetHistory":{"literal":{...}}}`. Decode its literal root as authored data, not a tag; decode children recursively with the same grammar. This handles nested lookalikes and strings inside escaped objects.

Only content uses this grammar. Envelopes, omission metadata and selection paths do not. Read selection paths against reconstructed content. Decoding restores retained sanitized values, not removed secrets or excerpt middles.

Pooling excludes generated excerpts/omissions at private provenance paths. An excerpted event can still pool complete strings elsewhere. Authored excerpt-shaped objects have no runtime provenance. Nonidentical documents with matching generated tails stay inline. Even identical oversized originals can shorten with zero savings. This TENET-24 parent-approved limit does not depend on tool names, anchors or document syntax.

### Preserve expanded and structural bounds

The selector keeps private expanded bounded content beside each event. Reselection never decodes caller-authored tags/pools. It tightens expanded caps first, then regenerates references/pool before byte eviction and after each eviction. Unused/nonrepeating values disappear; IDs can change between snapshots.

Literal-escape overhead counts against expanded event caps. Wrapper nodes/depth are reserved before copying. Pool construction visits normalized bounded JSON only, not host objects. Admission and in-flight snapshots have independent frozen pools.

Reference eligibility keeps the 4,096-node/depth-64 bounds at each encoded `data.content` root, including literal wrappers. Each reference adds two nodes and two depth levels. Unsafe occurrences stay inline; safe counts, profitable candidates and IDs are recomputed.

Excerpt search still checks the complete candidate `data` envelope. For shortened content whose escaped-inline envelope passes that guard, eligibility also reserves the complete `data` root's nodes, including redaction/selection metadata, and its additional root-depth level. Both roots use the same node-room measurement and reference overhead.

Pooling adds no whole-trajectory structural admission/eviction cap. If escaped-inline trajectory passes the aggregate guard, compact trajectory must also pass, including pool, envelopes and metadata, or fall back inline with zero savings. Previously aggregate-over-limit inline trajectories keep predecessor byte/count behavior. Do not add shortening, omissions or unavailable status to make pooling fit.

### Read recorded representations unchanged

Current identities are `bounded-history-v2`, `policy-rules-v7-ordinary-evidence`, `evidence-context-v1`, schema 4 and `applicability-v1`. Historical `policy-rules-v7-evidence-selection` requests retain their recorded questions and meaning. Optional references complete v2's representation; there is no extra legacy mode.

TENET-23 inline payloads, zero savings and inline questions remain recorded. Readers do not decode or compact historical evidence for display. The evidence dock shows exact recorded references, pool and excerpts. Coverage shows recorded exact savings separately from shortened, dropped and prior-omitted history.

## Evidence is not authority

Preparation never rewrites pending arguments or current resolved facts. It cannot promote historical `authenticated-complete` into top-level `resolvedAction` or old approval into invocation-local permission. Only the trusted configured resolver authenticates current facts. Stock Pi/Claude resolution is unsupported; cleaner history does not certify effects.

`applicability-v1`, integrity, WARN, FAIL/UNKNOWN, outcome/evidence thresholds, INSUFFICIENT and applicability validation remain unchanged. Enforce still requires fresh policy and unchanged identity/arguments. ASK still needs trusted one-call approval. Observe permits independently of findings.

```text
bounded admission --> immutable snapshot --> final protected-state fit
                                                   |
                                  submitted judgeState + owner EvidenceContext
                                                   |
                                   exact archived payload + recorded diagnostic
```

The owner diagnostic describes the final captured request. It stays outside evaluator evidence and cannot change a gate or authorize a call.

## Runtime evidence context

`src/decision/evidence-context.ts` derives completed `EvidenceContext` once from the immutable final request. `boundEvidence` attaches it to the owner-facing wrapper. `judgeState` excludes it from evaluator evidence.

Selection uses bounded recorded identities and ingestion order, not domain-specific hints. Questions explain only the versioned representation. There are no new gates, probability overrides or permission exemptions.

| Diagnostic | Meaning and bounds |
| --- | --- |
| `version: evidence-context-v1` | Owner diagnostic identity |
| Selection / questions / assessment | Current `bounded-history-v2` / `policy-rules-v7-ordinary-evidence` / `applicability-v1` |
| TENET-22 schema 4 | Recorded `bounded-history-v1` / `policy-rules-v6-applicability` and original counter shape; no inferred v2 counters/caps |
| `preparation` | `completed` only after required current evidence fits, independently of evaluator availability |
| `resolution.status` | `unsupported`, `authenticated-partial`, `authenticated-complete` copy captured resolver status. With no resolver, status defaults to `unsupported`. `unavailable` means capture/preparation did not establish status. History never upgrades effect coverage. |
| `current.redactedFields` | Removed fields across current arguments/tool metadata and resolved facts |
| Current/resolver limitations | Sanitized captured values, without added paths, arguments, operation content or guessed rationale |
| Completed `history` | Event/state limits, effective history/event byte allowances, retained events, serialized UTF-8 trajectory bytes, shortened events, selector drops, known prior omissions and exact-compacted bytes |
| `omittedEvents` | Dropped plus prior omissions, not missing content within retained events |
| Each limitation list | Deduplicated, at most 16 entries and 128 UTF-8 bytes per entry; `limitationsTruncated` reports loss |

### Validate diagnostic fields

`validEvidenceContext` in `src/decision/evidence-context-contract.ts` rejects unknown fields and identities. Counts must be nonnegative safe integers. `maxBytes` must be positive, and `retainedEvents` must not exceed `recentEvents`. Unavailable preparation requires `history: null`. Completed preparation requires non-null `current`/`history` and a resolution status other than `unavailable`.

For v2 history, it also checks:

- `maxHistoryBytes <= floor(maxBytes / 3)`.
- `retainedBytes <= maxHistoryBytes`.
- `maxEventBytes === floor(maxHistoryBytes / 4)`.
- `shortenedEvents <= retainedEvents`.
- `omittedEvents === droppedEvents + priorOmittedEvents`.

V2 adds `maxHistoryBytes`, `maxEventBytes`, `shortenedEvents`, `droppedEvents`, `priorOmittedEvents` and `exactCompactedBytes` to the recorded history. V1 keeps only its original `recentEvents`, `maxBytes`, `retainedEvents`, `retainedBytes`, `omittedEvents` and limitation fields. Missing v1 counters are not zero v2 counters.

Completed history also includes bounded captured limitations and private normalization gaps from retained events. Counters never claim complete external history, rule materiality or execution. A group is not an authenticated execution identity. Original sanitized evidence stays inspectable. Free-text source and limitation strings can retain secrets despite field redaction.

History normalization keeps private weak-map gap provenance across final immutable copies. It is not serialized into evaluator state or archives. Authored `tenetOmission` keys cannot create it. Only retained events contribute content gaps; whole excluded events count in `omittedEvents`.

Pending, dropped, cancelled and early failures have unavailable preparation and null final history counters. Capacity failure can retain captured current coverage/redaction without claiming completed history. Provider errors, invalid responses and timeouts can have completed preparation but no valid assessment.

Completed results carry the same deeply frozen context through consequences, SDK assessment results/events, Pi live reports/native recovery, Claude programmatic owner records and archives. Recording-off stops archives, not live diagnostics. Archive/listener failures are best effort and never authorize actions.

## Recorded and inspector explanations

New schema-4 writes put the diagnostic on request, assessment, decision, permission and assessment-status stages. Requests also record selection identity outside the submitted payload. Readers validate known identities, shape and bounds. A standalone writer without a prepared diagnostic records unavailable preparation, never reconstructed counters.

Schemas 1 through 3 keep original payloads, thresholds, questions and assessment identities. Missing historical context says `Not recorded`, not complete coverage. Readers older than schema 4 must report unsupported schema. Rollback never rewrites archives.

APUS keeps the same canonical evidence capture and selection counters. Its separately recorded `apus-recording-v1` contract describes native rendering, transport mapping and deterministic selectors. Neither native token/cache counters nor NONE probability one authenticate coverage. See [the native recording contract](assessment-contract.md#native-recording-contract).

### Explain uncertainty conservatively

The inspector prefers finalized recorded preparation over an earlier pending value. It never recomputes decisions. An uncertainty-only BLOCK may say "No rule was classified as violated" only with:

- The policy's full rule set and integrity result.
- Valid distributions and recorded successful validation/assessment.
- No selected FAIL.

Observe says "would block". The explanation is explicitly not a safety guarantee. Missing/invalid stages, malformed rule results or FAIL suppress it. Coverage gaps and UNKNOWN/INSUFFICIENT are separate; neither proves the cause of the other.

The browser-safe `src/decision/assessment-shape.ts` checker is shared with runtime validation. It checks the recorded contract's complete rule identities, profile, distributions and bounded applicability references. It does not authenticate exemptions or recalculate gates.

Validation issues/failures on assessment, validation, decision or lifecycle stages suppress the affirmative statement. Unprofiled assessments use the legacy structural contract with `legacy (historical)` display. Unknown recorded contracts stay conservative.

Open **Details** for recorded resolution/history coverage and its interpretation limits. Open **Evidence** for bounded limitations, exact diagnostic JSON and untouched submitted evidence.

Permission, approval, would-decision and execution remain independent. Released permission without a result means unknown execution. The Claude programmatic callback supplies no trusted live owner UI to the stock CLI.

## Regression seams

TENET-21 centralized preparation. TENET-22 added owner-only coverage diagnostics and schema 4. TENET-23 bounds oversized history. TENET-24 adds exact complete sanitized-string compaction at base `8301e099e8402616b967ccad22237e19e88df698`, approved in [PR 55](https://github.com/koenvg/Tenet/pull/55). TENET-25 adds bounded call/result groups and batched SDK/recovery admission.

These are documented offline boundaries and historical verification claims, not checks newly run for a documentation edit:

- Injected-judge requests/decisions through `decide` and Pi/SDK entry points.
- Immutable `Observations.snapshot()` values, including unsupported-content markers and missing metadata.
- Compiled SDK `setHistory` admission and permission/assessment results. No fixture action is dispatched.
- Owner events, recordings and inspector projections in the required suite. TENET-21 added no projection fields or record versions; TENET-22 adds the owner diagnostic and schema 4.

`test/evidence-preparation.test.ts` keeps authored current-state count, zero-history, UTF-8 pressure, chronological-recovery and conservative-capacity baselines. TENET-23 versions smaller retained-history expectations and checks selection summary separately. `test/sdk-history.test.ts` pins provenance, omissions, redaction, missing metadata and permission/assessment, including a throwing getter in excluded history.

### TENET-22 regression seams

- `test/assessment-shape.test.ts`: shared runtime/recorded structural rejection, immutable archived inspection and structural validity without exemption authentication.

- `test/evidence-context.test.ts`: immutable captured-request diagnostics, redaction, omitted history, UTF-8 limitation bounds, unavailable preparation and prepared-but-unavailable assessment.
- `test/evidence-context-delivery.test.ts`: compiled SDK results/events and owner records across both modes, recording on/off and unsupported/partial/complete coverage; Pi live/archive equality; listener failure and unavailable SDK results.
- `test/evidence-context-recording.test.ts`: schema-4 malformed/unknown diagnostics, historical schema availability and unchanged interpretation, Claude live/archive parity, recording-off and disk/listener failures, unchanged protocol responses.
- `test/inspector-presentation.test.ts` and `inspector/tests/debugger.vitest.ts`: conservative completeness checks, uncertainty versus FAIL, unavailable/not-recorded states, observed execution, keyboard focus and mobile ordering. The existing evidence-preparation baselines now compare the exact request excluding the new owner-only diagnostic; their submitted content expectations were not regenerated.
- Existing decision, applicability, resolution, approval, SDK handoff, recording-failure and Pi parity tests pin unchanged enforcement mechanics. No stored or authored fixture action executes during these diagnostic tests.

Acceptance mapping, exact checks, review outcome and limits are in [TENET-22 handoff](TENET-22-handoff.md).

Existing trajectory, resolved-action, applicability, approval, owner-reporting and host parity tests cover frozen snapshots, session isolation, protected current facts, unsupported applicability and unchanged enforcement behavior. These offline scripted tests establish mechanical equivalence, not live evaluator accuracy.

For required checks, see [CONTRIBUTING.md](../CONTRIBUTING.md). Completion results and the single fresh-context review are recorded in [TENET-21 handoff](TENET-21-handoff.md).

### TENET-23 regression seams

- `test/bounded-history.test.ts`: default and tiny caps including metadata, nested/multibyte/escaped strings, nonidentical anchored echoes, safe original ranges, zero history, bounded nodes/depth, circular/sparse/getter omissions, redaction, literal lookalikes, final tightening, current-argument capacity and immutable admission summaries.
- `test/history-envelope.test.ts`: compiled SDK, live admission and final preparation reject accessor/circular/object-valued metadata, invalid timestamps and oversized UTF-8/escaped identities without touching or freezing caller objects. Unknown envelope fields and array slot accessors never become submitted evidence.
- `test/evidence-context-delivery.test.ts`: large shortened SDK history across both modes, recording on/off and unsupported/partial/complete facts, listener failures, live Pi result ingestion and live/archive equality.
- `test/evidence-context-recording.test.ts`: v2 loss-counter/allowance validation, schema-4 v1 preservation without new counters, request identity agreement and existing unavailable/Claude archive paths.
- Existing resolution tests preserve complete authenticated facts and optional-metadata priority, and prohibit submission when current facts cannot fit. Existing applicability, confidence, WARN, integrity and approval tests pin enforcement. The Svelte browser suite displays shortening/drop/prior-omission counts separately from zero exact compaction, beside unchanged decision/coverage wording.

These tests establish offline preparation and reporting mechanics, not semantic accuracy. These predecessor checks do not by themselves establish TENET-25 grouping. The acceptance map, base, validation logs and single review outcome are recorded in [TENET-23 handoff](TENET-23-handoff.md).


### TENET-24 regression seams

- `test/exact-history.test.ts`: captured requests and immutable snapshots, exact independent round trips, 256 serialized-byte threshold, full pool/reference overhead, short/nonidentical values, literal/forged markers, redaction, admission retention under byte pressure, pruning, 256-entry limit, expanded caps, structural bounds and zero/tiny capacity.
- `test/exact-history-delivery.test.ts`: compiled SDK concurrent sibling completion and session isolation; Pi live diagnostics, injected Jev transport, exact schema-4 request/archive payloads and inspector projection. No authored fixture action executes.
- `test/evidence-context-delivery.test.ts`: positive exact savings alongside runtime excerpts across both modes, recording on/off and unsupported/partial/complete resolution, preserving owner event/report/archive equality.
- `test/evidence-context-recording.test.ts`: nonnegative integer savings validation and unchanged historical v2 inline payloads/questions/zero savings, beside the existing v1/schema regressions.
- `inspector/tests/debugger.vitest.ts`: separate recorded saved/loss counts, actual submitted pool/reference JSON, unknown execution, keyboard-reachable detail and readable mobile layout.

Required checks, the parent-approved excerpt eligibility limitation and the sole completion review are recorded in [TENET-24 handoff](TENET-24-handoff.md). These tests prove offline mechanics, not live accuracy or provider token savings. The grouping acceptance map is in [TENET-25 handoff](TENET-25-handoff.md).

### TENET-25 regression seams

- `test/history-groups.test.ts`: captured requests and immutable snapshots for interleaved/count/byte pressure, preceding results, missing/empty/reused identities, session separation, failures/contradictions, oversized groups, fixed admission windows, sparse/accessor inputs, zero history, excluded payload isolation, recovery eligibility, inline/pooled pruning and exact reconstruction/savings.
- `test/history-group-controls.test.ts`: authored earlier-context retained/lost controls with fixed offline FAIL/UNKNOWN mechanics, plus compiled SDK mixed/opaque effects, stale/forged applicability references and stale resolver release rejection. No fixture action executes; labels are not live semantic-accuracy evidence.
- `test/history-group-delivery.test.ts`: compiled SDK inline/pooled shortened groups across both modes and recording on/off; late sibling isolation; immutable owner-event/report/archive/schema-4/inspector equality; Pi live failure/chronology and diagnostics.
- `inspector/tests/browser-fixture.ts` and `debugger.vitest.ts`: actual current interleaved group selection, explicit shortened/dropped/prior counters, original chronology, failure metadata, exact recorded references and conservative missing-result wording. Mobile screenshot inspected for readability and no horizontal overflow.

Existing root-specific pooling/envelope bounds, current-fact capacity, enforcement/applicability/approval, historical recording and invalid-assessment presentation tests remain required. The acceptance map, validation logs, sole review and limits are in [TENET-25 handoff](TENET-25-handoff.md). TENET-26 owns the cross-domain comparison report. No live provider run, fixture dispatch, new host coverage or semantic improvement is claimed.


## Final offline comparison and epic verification

This section preserves TENET-26's historical comparison and integrated verification. The counts, failures and review outcome below are not new validation results for later documentation changes.

TENET-26 starts at integrated TENET-25 commit `b5e3c935408f934ffdc805d6e4ad9b63c6e22d0c`. Its authored label/baseline checkpoint is `bdc5195`. The final integrated review uses original epic base `2320f3295c3682b5303f5e6d8c9c84685f85ea73`; TENET-21 is already in that base and retains its own earlier review.

The reproducible [readable offline report](../eval/evidence-selection/report.md) and [machine-readable exact payloads](../eval/evidence-selection/report.json) compare frozen authored inline baselines, `authored-inline-v1` with selector identity null, against the current `bounded-history-v2` selector. This is not measured pre-change behavior or a current-selector reconstruction labeled historical. Large authored snapshots are not claims of historical runtime admission.

Policy, thresholds, pending arguments, integrity, authenticated current facts and v7 generic question semantics are fixed within every pair.

Replay from the repository root after local frozen dependency setup. This supported offline path requires the builds below. It must exit zero and leave both report files unchanged, so the final diff command prints nothing. If it differs, inspect the report/test failure rather than updating historical evidence to hide it:

```sh
bun run sdk:build
TMPDIR=/tmp bun test test/evidence-selection-report.test.ts
bun eval/evidence-selection-replay.ts
git diff --exit-code -- eval/evidence-selection/report.json eval/evidence-selection/report.md
```

The offline runner accepts no live or execution flags and imports no provider transport/executor. Denied arguments are tested with an injected transport proving zero calls. Future live comparison needs separate explicit disclosure authorization and an authorized runner enforcing that authorization before any network call. This runner cannot perform live replay even with an authorization flag. No live run, fixture action, host restart or external executor change occurred.

The 20-pair report records exact UTF-8 state and application request bytes, representation/selector/question/profile identities, resolution coverage, loss counters, deterministic gates and separate permission projections. Provider tokens, returned model and latency remain null.

Exact duplicate history saves 644 net request bytes with unchanged scripted uncertainty; candidate lossless compaction itself saves 935 bytes. Nonidentical echoes shorten with zero exact savings. A smaller context-loss request changes a selected violation into uncertainty after two drops and cannot count as improvement. Request growth is also visible.

Authored violations remain 7/20; validated assessments are 17/20 on each side. Selected violations change from 7/17 to 6/17, and uncertainty-only blocks from 8/17 to 9/17. Each side has one unavailable, one invalid and one skipped assessment, one ASK and zero unsafe allows among 19 protected cases.

Tests deliberately inject blanket blocking and protected unsafe allows and require those failures to remain in fixed denominators. These results are mechanical verification only, not semantic accuracy, calibration, deployed-host enforcement or provider performance evidence.

Omission counters can count known source slots or emitted observations, not the exact number of missing eligible calls/effects. The corpus's two dropped observations are known authored observations; zero prior-capture omissions never establishes complete capture. Unknown eligible-event loss counts stay null. Positive source-slot loss and live irrecoverable omissions are covered separately by integrated admission tests.

Final scenario mapping, original approved checklist reconciliation, exact checks/results, sole reviewer outcome and deployed-host limits are in [TENET-26 handoff](TENET-26-handoff.md). The final report tests pin denominator integrity, fixed protected evidence/questions, renamed tools, forged/stale applicability references, null offline metrics, byte measurements and deterministic replay.

The complete root and inspector gates cover SDK/owner/archive distinction, historical interpretation and unchanged enforcement scenarios mapped in that handoff. Stock resolution and stock Claude trusted owner UI remain unsupported/unverified; free-text evidence can still contain secrets.


Settled integrated checks pass: SDK and inspector builds; final post-review 793 Bun tests across 81 files; root typecheck; inspector check with no errors/warnings; 16 component and 26 browser tests; status-plugin static check and 18 tests; offline SDK example; diff check.

The first browser attempt passed 25/26 and missed the existing poll deadline for the schema-3 lifecycle pending tag. The focused case and subsequent full component/browser command passed without changes. The failure is retained, its cause is unknown, and no host-load attribution or assertion/timeout weakening is made. Exact commands, logs and the sole integrated-review outcome are recorded in the handoff.


The sole fresh-context reviewer inspected the full epic diff and returned one P2 reporting blocker. Invalid/unavailable rows invented an observe would-decision from enforcement's fallback BLOCK. The task-local test-first correction projects null without a validated assessment while retaining conservative enforcement, statuses and released observe permission. The original request-changes report is preserved separately from implementer resolution.

Post-fix focused checks, SDK build, complete Bun suite, typecheck, six report tests and diff check pass. No second review or independent re-review of fixes is claimed.
