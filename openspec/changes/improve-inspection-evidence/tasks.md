# Tasks

## 1. Freeze the regression contract

- [ ] 1.1 Record the pre-implementation commit and the public test seams in `docs/inspection-evidence.md`: captured judge requests, immutable history snapshots, SDK owner events and inspector projections. Verify the document names the unchanged gates and unsupported stock-host coverage.
- [ ] 1.2 Add sanitized authored baseline snapshots for the small inspection action after exact duplicate history and after nonidentical anchored echoes. Verify fixture validation excludes original session IDs, local paths, private review text and credentials; no fixture action executes.
- [ ] 1.3 Add test-first selection assertions through captured requests in `test/trajectory.test.ts`, including domain-neutral renamed tools, default history/per-event caps and unchanged pending arguments/facts. Verify the new assertions fail against current FIFO preparation for the intended reasons.

## 2. Implement one bounded generic selector

- [ ] 2.1 Add shared history-selection contracts and the module described in the design. Integrate admission-time and final-request preparation through it. Verify focused trajectory tests cover live ingestion, recovered history and SDK history without competing pruning implementations.
- [ ] 2.2 Implement exact sanitized-string pooling only when serialized bytes decrease. Verify round-trip reconstruction, distinct event identity, chronological order, short-string behavior and unchanged nonidentical anchored echoes in offline tests.
- [ ] 2.3 Escape literal reference-shaped objects and keep pools snapshot-local. Verify forged lookalike markers remain literal untrusted data, all retained references resolve, and unused entries disappear after selection.
- [ ] 2.4 Implement the one-third optional-history allowance and one-quarter expanded-content event cap using serialized UTF-8 bytes. Verify large documents, nested values, multibyte strings, zero history, tiny limits and current-facts-over-capacity cases through captured requests.
- [ ] 2.5 Preserve call/result relationships while shortening content with explicit head/tail ranges or omission markers before dropping groups. Verify missing results never become success, observation order survives and loss counters differ from exact-compaction counts.
- [ ] 2.6 Keep redaction before interning and bounded pre-copy admission. Verify credential fields, unsupported/circular values, node/depth limits, oversized admission markers, concurrent sibling results and session isolation in offline tests.
- [ ] 2.7 Document the representation, caps and information-loss behavior in `docs/inspection-evidence.md`. Verify examples round-trip under the selector tests and identify unsupported resolution without claiming a permission exemption.

## 3. Carry evidence context without changing enforcement

- [ ] 3.1 Add the readonly evidence-context diagnostic to the shared decision contract and derive it from the immutable invocation evidence, including unavailable-preparation states. Verify supported/partial/unsupported resolution, redaction, selection summaries and invalid/missing assessment cases with injected judges.
- [ ] 3.2 Propagate finalized evidence context through runtime consequences and SDK assessment results/events. Verify equality with the captured request summary, immutability, recording-disabled delivery and pending-to-completed observation behavior in SDK/runtime tests.
- [ ] 3.3 Carry the same value into Pi and Claude owner-report paths without adding host resolver claims. Verify live report/archive parity and observer callback failures through existing host test harnesses.
- [ ] 3.4 Add enforcement invariance controls for FAIL, UNKNOWN, INSUFFICIENT, low confidence, unsupported applicability, WARN and observe mode. Verify identical validated assessments still produce the same gates, approval requirements and permission consequences.
- [ ] 3.5 Document evidence-context availability and provenance in `docs/sdk.md` and `docs/action-resolution.md`. Verify exported SDK type fixtures compile and documentation distinguishes a runtime gap from a model explanation or authorization.

## 4. Version requests and recordings

- [ ] 4.1 Introduce `bounded-history-v2` metadata and `policy-rules-v7-evidence-selection` generic representation instructions while retaining `applicability-v1`. Verify captured Jev payloads explain references/excerpts without domain branches, and response-validation tests retain existing labels and thresholds.
- [ ] 4.2 Advance new archive writes to schema 4 and validate bounded evidence-context fields for applicable stages. Verify malformed diagnostics, unknown versions and oversized fields are rejected without altering supported historical record validation.
- [ ] 4.3 Update archive/index projections and reader support for schemas 1 through 4. Verify older requests remain byte-for-byte represented as recorded, absent diagnostics say not recorded, and historical decisions/thresholds are not recalculated.
- [ ] 4.4 Persist finalized diagnostics and selector identity consistently with live reports. Verify request, assessment and decision stages agree where preparation completed, including unavailable assessments and recording-capture failures.
- [ ] 4.5 Update `docs/assessment-contract.md` and `docs/inspection-evidence.md` with version identities and rollback limits. Verify schema fixtures demonstrate older-reader incompatibility without an archive rewrite or runtime selector toggle.

## 5. Explain uncertainty in the inspector

- [ ] 5.1 Extend inspector view/presentation projections with recorded evidence context and a validated uncertainty-only explanation. Verify selected FAIL, uncertainty-only, invalid assessment, missing stages and older schemas in presentation tests; incomplete data must not produce a no-violation statement.
- [ ] 5.2 Add the compact resolution/history summary beside the existing decision explanation and expose pools/excerpts in the evidence dock. Verify Svelte browser tests cover unknown coverage, partial facts, exact compaction, lossy history and not-recorded diagnostics.
- [ ] 5.3 Preserve would-decision, permission, approval and execution separation in the updated UI. Verify observe-mode executed/would-block and released-without-result cases, keyboard navigation and a narrow viewport with the summary above the detail dock.
- [ ] 5.4 Update inspector documentation with representative uncertainty, violation and unavailable examples. Verify screenshots or browser assertions match those labels and do not imply that observation stopped the call.

## 6. Produce generic offline comparison evidence

- [ ] 6.1 Extend fixture controls with unrelated read/transmission/mutation policies, unfamiliar tool names, context-dependent references, compound effects, protected-policy mutation and forged/stale facts. Verify authored expected labels and reporting tags never enter the judge payload.
- [ ] 6.2 Compare frozen authored baseline snapshots with candidate snapshots under fixed policy, thresholds and generic question semantics. Verify deterministic paired rows record selector/question/profile identities, request bytes, fact coverage and omissions without keeping a legacy production selector.
- [ ] 6.3 Add explicit denominators for violations, uncertainty-only blocks, unavailable/skipped rows, approvals and unsafe allows. Verify report tests expose blanket blocking, lost material context and unsafe protected-control allows instead of counting them as improvement.
- [ ] 6.4 Preserve the explicit live-disclosure authorization gate and forbid fixture execution. Verify normal CI succeeds without provider credentials and unauthorized live arguments fail before a network call.
- [ ] 6.5 Deliver an offline comparison report and document the replay procedure in `docs/inspection-evidence.md`. Verify smaller requests are reported separately from semantic accuracy, and token usage/latency unavailable offline are not fabricated.

## 7. Verify the complete change

- [ ] 7.1 Run `bun run sdk:build`, `bun run inspector:build`, `bun test --isolate --max-concurrency=1 --timeout=30000`, `bun run typecheck`, `bun run inspector:check` and `CI=1 bun run inspector:test` against the settled implementation. Verify all required affected-system checks pass and report any skipped coverage explicitly.
- [ ] 7.2 Run the single fresh-context read-only completion review required by the implement workflow against the recorded base commit, including untracked files. Verify blocking findings are resolved and affected checks rerun; do not launch a second review.
- [ ] 7.3 Complete the implementation handoff in `docs/inspection-evidence.md` with scenario-to-test coverage, command results, offline report location and unresolved deployed-host coverage. Verify it records no live authorization, no claimed semantic-accuracy proof and no changes to external host packages or running services.
