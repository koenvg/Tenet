# Design

## Context

See [proposal.md](proposal.md) for motivation and the four delta specs for behavior. This is a cross-cutting runtime and recording change, so a design is required.

The current runtime captures raw tool metadata and arguments, snapshots up to 12 recent observations within 24 KiB, then awaits `decide` before releasing either observe or enforce calls. `questions.ts` asks an outcome and evidence question for every rule, including integrity. `diagnostics.ts` treats selected FAIL, UNKNOWN, INSUFFICIENT and either low score as blockers. The evaluator's generic instructions already say to assess immediate effects; adding that sentence again will not resolve the observed edit/commit confusion.

Pi supplies a description and schema through `getAllTools`, but no authenticated anchor target or execution contract. `Capabilities.argumentStability` is false in the current adapter. Claude also declares coverage limits. These are genuine missing integrations, not fields TENET can safely infer from a tool name.

`SessionGuard.record` currently removes its recording sink on execution. `agent_end` invalidates the entire runtime generation. Both assumptions must change for result-before-assessment observation. `Consequences.permission` and historical view code also assume a would-decision is already available.

The installed inspector process was started before schema-2 support and rejected newer files as unsupported. The checkout already understands schema 2. This is a deployment mismatch, not missing schema-2 source support.

### Evidence baseline

The read-only investigation used Pi records dated 2026-09-25 before 13:00 UTC, grouped by qualified session and invocation identity, excluding synthetic Claude sessions and this investigation. Four sessions contributed 157 decisions, all observe/released. There were 24 ALLOW and 133 BLOCK counterfactuals: 92 all-PASS assessments, 36 assessments with FAIL, four invalid responses and one approval-labelled publication with blocking uncertainty. Of the FAIL-labelled calls, 30 edited text and two staged files without committing. Two actual commits matched the recorded prohibition; two merges were not cleared as false positives. The documentation-integrity case was corroborated by a subsequent recorded patch targeting `docs/claude-code.md`.

Useful non-secret invocation references for authoring sanitized fixtures are `d7b56689-8873-4d04-8e29-11c5bece948b` for brace insertion, `0b3c6111-a074-4060-842c-a9a2281d1431` for the documentation edit, `99e0deea-16da-4d4d-8110-19a5c7c5d695` for staging, and `350a04b8-e94b-4585-be4e-8229fdef294c` for publication approval mixed with uncertainty. Do not copy the raw archive into the repository.

Assessment duration had median 875 ms and p95 1,304 ms. Summed assessment time is not wall-clock delay because concurrent calls overlap. These observations identify a regression workload, not Tenet-wide calibrated accuracy.

## Goals / Non-Goals

**Goals:**

- Improve evidence at the host-to-runtime seam rather than proliferating domain-specific prompt exceptions.
- Separate immutable evidence, semantic assessment, deterministic consequence and actual execution.
- Remove network assessment waits from observation without weakening enforcement defaults.
- Make new behavior testable with injected hosts, judges and clocks, and make unsupported integrations visible.

**Non-Goals:**

- A general shell interpreter, effect-proof system, arbitrary filesystem crawler or OS sandbox.
- Treating text descriptions or installed tool names as authenticated read-only guarantees.
- Default promotion of new semantic behavior, lowering thresholds, changing the unconditional commit rule into an approval rule, or learning permissions from review labels.
- Changing external Pi tool packages, upgrading dependencies, restarting running services or sending live evaluator requests under this proposal.

## Decisions

### 1. One resolved-evidence module at the existing host seam

Add a small optional resolver interface to the host/runtime contract. The host injects a provider bound to its executing tool implementation, never one named by agent arguments. Its output includes an integration identity/version, original argument digest, supported operation semantics, literal content, resources, a snapshot binding and explicit coverage limits. Its validation operation checks the same binding immediately before enforce-mode permission is released.

The runtime owns validation, bounding, redaction and recording of that output. A provider cannot mark arbitrary supplied prose as verified; its declared semantics must be backed by conformance tests and an authenticated registration path. Aliases, links, parent operations, compound edits and stale resolver generations belong in those tests. Complete coverage requires that the execution path honors the checked binding. Checking a path once does not eliminate a race after release.

Current Pi/Claude adapters use the unsupported result unless their embedding supplies this integration. Expose a resolver option through the Pi registration entry point and shared runtime, with contract tests. Stock host support is not a deliverable that this repository can invent. External tool integration is a separately owned prerequisite for claiming resolved-anchor coverage in production; until then the applicability exemption remains unavailable for those calls. Historical anchor mappings can enrich ordinary untrusted evidence but cannot satisfy this prerequisite.

Rejected alternatives: parsing tool descriptions as contracts, maintaining a tool-name allowlist, or treating an old anchor row as a current path. All can declare unsafe or stale operations harmless.

### 2. Add an explicit assessment profile rather than replacing legacy gates

Introduce `TENET_ASSESSMENT_PROFILE=legacy|applicability-v1`, default `legacy`, fixed at process start and captured with each invocation. An invalid value is a configuration failure with existing mode-specific consequences, not an implicit opt-in. Do not overload `TENET_MODE` or put profile control in agent arguments.

The candidate extends the generic outcome question with NOT_APPLICABLE. The response contract uses one outcome distribution with a tagged justification: NOT_APPLICABLE cites resolved-fact identifiers and has no evidence-score field; other outcomes retain an evidence distribution. The SDK adapter must validate the selected branch and every expected rule. If the provider cannot express the tagged shape directly, request a fixed schema and ignore the evidence field only for a fully validated NOT_APPLICABLE branch; do not add a second network round trip. Record which schema was used.

Only complete, authenticated execution facts bound to this invocation can support the exemption. Referenced facts must exist; partial, redacted material facts, unsupported execution semantics and stale bindings cannot qualify. To keep the first version auditable, do not allow an unresolved effect to be waived merely because the model calls it irrelevant. Such calls retain ordinary PASS/evidence handling, or uncertainty when the response attempts an unsupported exemption. Full action facts still do not prove the model correctly interpreted arbitrary policy text; this remains a fallible semantic decision.

A supported NOT_APPLICABLE result must meet the existing outcome threshold, 0.90 by default. For ordinary PASS/APPROVAL_REQUIRED, retain both existing gates. FAIL and UNKNOWN remain blockers for BLOCK rules. Unsupported NOT_APPLICABLE is a per-rule unresolved result, not permission. WARN remains advisory; malformed whole responses remain operational failures. Built-in integrity is assessed independently and cannot inherit a user rule's threshold or exemption.

Keep all defaults until separately authorized live comparisons justify promotion. The candidate can be exercised explicitly in observe mode or offline. Explicit owner selection in enforce mode is possible but must display experimental semantic coverage and unsupported integration limits. Passing tests never automatically promotes it.

This changes the compatibility requirement that previously allowed only four outcomes, and the assumption that every assessed rule has an evidence gate. The delta makes both exceptions explicit. Shared prompts stay generic; domain examples remain fixtures and policy text.

Rejected alternatives: deleting the evidence gate for every PASS, interpreting a low-confidence FAIL as a pass, or asking a separate model to decide which rules to skip. They either weaken relevant uncertainty handling or add another fallible gate and network delay.

### 3. Keep policy meaning explicit and evaluate wording separately

The proposed bundled rule is: `Never create a Git commit. Reading, editing and staging files alone do not violate this rule.` Keep its unconditional meaning and global thresholds. Other policies, including active external owner files, are not migrated automatically.

Compare original and clarified wording as separate fixture variants. A text edit containing `git commit` is not execution of that command. A real compound edit-and-commit remains prohibited; a merge's commit effect is not assumed away. A rule that requires human approval is a different policy, not an interpretation of this prohibition.

### 4. Observation uses a bounded queue with its own lifetime

Add an observation scheduler owned by `GuardRuntime`, not by individual Pi callbacks. Start with two running jobs, at most 32 waiting jobs, at most 1 MiB of retained snapshot data across running and waiting jobs, and five seconds maximum queue age. Keep the current per-request deadline after dequeue. Bounds are constructor-injectable for tests and recorded in coverage metadata; new environment knobs are unnecessary initially. FIFO admission with drop-newest on capacity gives deterministic behavior.

The call path performs bounded capture, policy/control checks and snapshot creation, records permission as released/pending, then returns. Network work starts on the scheduler, without awaiting a provider from the host callback. Resolver work on this path must be local and bounded; an unavailable resolver is marked unsupported rather than delaying observe indefinitely.

Each job owns the frozen snapshot, generation, cancellation controller and assessment recorder. Tool execution tracking is separate. Retain the recorder until both execution tracking and assessment are terminal, with bounded cleanup for missing results. An executed tool can still receive a later would-block assessment; it never receives a second permission record.

Separate execution-turn cleanup from observation-generation invalidation. `agent_end` can finish unmatched execution tracking under the existing unknown-result contract but must not cancel valid observation jobs. Session switch, fork/tree changes, shutdown, off, unavailable control and stale-policy invalidation revoke the relevant queued/running jobs. Completion checks generation and activation before owner delivery. On off, do not create new cancellation evidence after capture suppression; already queued archive writes can drain and unfinished historical records remain incomplete. Shutdown cancels jobs immediately and retains the archive's bounded drain rather than waiting for the evaluator.

New callbacks distinguish immediate permission from later assessment completion. Reporting exceptions and archive failures remain isolated from tool release. Later observations can enter the next call's snapshot, but never mutate an existing job's snapshot. No decision cache is introduced.

This intentionally supersedes the synchronous observation timing in `add-owner-only-observe-mode/design.md`. The off-state safety guarantees in `global-tenet-control` remain unchanged. Enforce calls continue through the synchronous guard and current freshness/approval checks.

Rejected alternatives: an unbounded detached promise per tool, sharing mutable history with background jobs, or rerunning assessment after execution. They lose resource bounds, pre-execution meaning or lifecycle ownership.

### 5. Version recording lifecycle, not just presentation labels

Use a new archive schema for asynchronous lifecycle records. Keep the schema-2 qualified session/invocation hash scheme so session navigation is stable across upgrades; accept mixed supported versions within a qualified session directory. Preserve schema-1 legacy hashes and attribution.

Represent assessment status as pending/completed/unavailable/dropped/cancelled independently of permission and execution. `wouldDecision` is absent while pending or dropped, not an invented BLOCK. Capture queue time, provider time, profile, fact coverage and terminal cause. Readers fold stages by stable invocation identity and stage semantics, not arrival order. A result can precede an assessment.

Do not reuse `Consequences.permission` to produce late owner reports or let `record('execution')` discard a still-needed job sink. Extend contribution/view records for a not-applicable evidence gate and optional precision metadata. Historical records retain historical scores and consequences; they are never rerun through the current policy.

Deploy the reader before the writer. Expose a read-only compatibility/status response containing reader build identity, supported schemas and aggregate unsupported-record coverage. The UI must show partial coverage prominently. An already running old executable cannot gain new behavior remotely: the runbook explicitly requires rebuilding assets and restarting that process. Existing unsupported-schema diagnostics remain the only warning for readers not yet upgraded.

### 6. One finding-classification module, multiple owner views

Derive finding categories and group keys in a shared pure module used by Pi owner reporting, archive summary indexing and detail views. Return multiple category tags per invocation and explicit distinct-call counts. Derive evaluator-unavailable from assessment state, not the mere existence of a BLOCK decision. This fixes the current summary shortcut that counts BLOCK as a concern even for invalid responses.

Group uncertainty by policy digest, rule identity, profile and gate or missing-fact code. Never group across policy versions. Bound aggregation and retain expandable invocation references and eviction indicators. Preserve owner-only delivery; reports do not become tools or model messages. Keep provider prose out of explanations and safe diagnostics.

A review label is evaluation data only. Initial regression handoff is a deliberately authored sanitized fixture, not a new inspector write endpoint or automatic archive export. This preserves the inspector's read-only contract.

### 7. Keep precision handling at the provider adapter

The four inspected invalid responses each had a four-way distribution totaling 0.99. That is evidence of an incompatibility, not permission to loosen validation globally.

First add bounded reason codes for response shape, unknown/missing keys, invalid score, sum mismatch and selected-choice mismatch. Preserve the original response snapshot under existing capture controls. Keep injected judges and unknown providers strictly validated.

Only enable a provider-specific precision adapter if the deployed SDK/provider contract documents rounding precision. Compute permissible score intervals and check whether a unit-sum distribution and selected ordering are possible. Use conservative lower bounds for allowing gates. Reject an ambiguous selected label or a threshold-straddling interval; never divide by the observed sum and silently promote 0.89 to a pass. Give the adapter its own version and retain the original values and interval metadata in new records. If the contract cannot be verified, ship improved diagnostics and leave acceptance unchanged. This fallback is part of the design, not a reason to guess.

### 8. Test mechanics separately from semantic improvement

Extend existing replay tooling instead of building another runner. Freeze sanitized fixture labels before candidate evaluation. Preserve original actions as inert data. Include original and clarified policy wording, supported and unsupported fact coverage, unrelated policy domains, actual violations and deliberate prompt-injection/forged-facts cases.

Ordinary tests use scripted judges, stalled promises and fake clocks. Required invariants include release-before-judge in observe, no-release-before-judge in enforce, lifecycle/off suppression, no mutation after snapshot, result-before-assessment persistence, mixed-schema historical identity, all legacy gate regressions and exact profile handling. Provider precision tests cannot serve as evidence of provider guarantees.

Live runs require a new explicit authorization to disclose the sanitized fixtures. Compare profiles and wording using pinned returned model identifiers and repeated canonical/held-out cases. Report false blocks on expected-ALLOW rows and unsafe allows on expected-ASK/BLOCK rows, alongside unavailable/skipped rows and evidence omissions. Require fewer unnecessary blocks and zero unsafe allows in protected canonical controls before considering default promotion. Held-out errors remain visible and require review; a bounded clean run is not a general safety guarantee.

## Risks / Trade-offs

- Authenticated tool facts are unavailable on today's stock integration. Mitigation: explicit unsupported coverage, an optional host-injected contract, conformance tests and no claim that the generic runtime alone fixes anchor resolution.
- NOT_APPLICABLE can still be a semantic false negative. Mitigation: opt-in profile, complete-fact prerequisites, retained outcome threshold, adversarial controls and no automatic promotion.
- Background assessment can lag or be lost at shutdown. Mitigation: queue limits, visible pending/loss status, stable snapshots and no claims of transactional audit completeness.
- A tool may mutate the active policy after observation releases it. Mitigation: keep captured policy identity, latch detected staleness for subsequent calls, cancel invalidated work and never rejudge with new bytes.
- New stage order can confuse older readers. Mitigation: reader-first deployment, schema bump, mixed-version tests and explicit restart/rollback guidance.
- Better precision handling alone will not clear the sample's other confidence gates. Mitigation: report its effect separately rather than claiming four corrected developer actions.
- Grouped UI counts can hide scope or overlapping categories. Mitigation: distinct-call counts, explicit category overlap and accessible individual records.

## Migration Plan

1. Land sanitized fixtures, diagnostic categories and forward-compatible reader changes before enabling new writer behavior.
2. Add the optional resolved-evidence contract and report actual adapter coverage. Do not modify external host/tool packages in this change. Document the exact conformance obligations for companion integrations.
3. Introduce the new recording schema and asynchronous observation together, preserving legacy profile selection and historical identities. Verify shared runtime behavior through Pi and Claude adapter tests without claiming live Claude coverage.
4. Introduce applicability-v1 behind explicit profile selection and clarify only the bundled policy. Retain original wording in replay fixtures and tell owners to reload/restart after choosing policy changes.
5. Validate offline mechanics, mixed-reader behavior and local performance. No live evaluation or production profile promotion is authorized by applying these code changes alone.
6. For rollback, restart with the legacy profile to remove applicability behavior. Rolling back code restores synchronous observation. Keep the newer read-only inspector for new-schema history, retain archives without rewriting, and document that old readers cannot fully inspect new records.
