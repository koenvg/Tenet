## Context

See proposal.md for motivation and the delta spec for behavior. The current parser stores rule text, line and immutable snapshot identity. `decide.ts` validates the complete assessment, applies 0.90 gates to every rule including integrity, then returns BLOCK, ASK or ALLOW. `guard.ts` adds numerous independent veto paths around initialization, capture, lifecycle, freshness, approval and reporting. Changing only the final BLOCK branch would not deliver observation mode.

The guard already distinguishes assessment, decision, permission and execution records. Its `record` helper feeds decision and approval records into evaluator trajectory; `recoverObservations` repeats this on recovery. `test/pi.test.ts` provides injected judges, fake UI and failure paths, and parser tests preserve semicolons in legacy text. The main spec has unconditional enforcement language that this delta explicitly qualifies.

This design is required because the change crosses policy parsing, decisions, failure handling, model visibility and migration.

## Goals / Non-Goals

**Goals:** Keep one semantic evaluator and a small deterministic consequence boundary. Make observation non-vetoing even when diagnostics fail. Keep owner reports separate from model evidence and actual tool outcomes.

**Non-Goals:** Asynchronous post-execution judging, confidence tuning, automatic promotion to enforcement, bypassing host cancellation, sandboxing, new tool APIs, live provider evaluation or a guarantee that agents cannot read locally accessible diagnostic files.

## Decisions

### Mode is process configuration, separate from fallible policy loading

Use `TENET_MODE=observe|enforce`, defaulting to observe. Resolve this before other config parsing or provider construction. Unknown values select observe with a configuration warning, because only an explicit enforce value should enable vetoes. Freeze the result for the process; switching requires a restart. Report it prominently even when policy loading fails. These naming and lifecycle choices are proposed implementation defaults.

Alternative: put mode inside TENET.md. Rejected because an unavailable policy would also make the non-vetoing contract unavailable, and policy mutation could change enforcement mid-call.

### Keep semantic findings independent of enforcement settings

Extend rule contracts and deterministic parsing with BLOCK/WARN. Recognize the exact uppercase token followed by a semicolon after trimming the declaration remainder, then preserve the remaining text. Legacy declarations default to BLOCK. Reserve those two prefixes; explain the rare compatibility collision with legacy text beginning `WARN;` or `BLOCK;`. Keep identity based on original policy bytes and line. Existing bounds still apply to the file, count and semantic rule text.

The evaluator receives semantic rule text rather than severity instructions. Validate every assessment as today. Generate diagnostics for all triggered gates, then aggregate only BLOCK rules and integrity for enforcement. WARN approval requirements are findings, not approval requests. Invalid whole responses remain operational failures in enforce mode even if a WARN answer caused invalidation. This preserves current complete-response validation rather than inventing partial trust.

Alternative: lower thresholds or ask the model whether to block. Rejected because it changes the measurement and makes deterministic owner policy a model decision.

### Apply mode at every host consequence boundary

Retain a counterfactual enforcement result with existing reason codes. Add mode and actual permission explicitly to diagnostic records rather than relabeling an observed would-block as an ordinary all-rules-pass ALLOW. Distinguish unavailable evaluation from assessed concerns.

Use a small consequence/reporting module rather than adding mode checks throughout the already large guard. All initialization, capture, freshness, cancellation, duplicate identity, assessment, lifecycle and exception paths must reach a mode-aware boundary. In observe mode it returns no veto and never invokes approval. Reporting is best effort and isolated from permission; failures in UI, appendEntry or observation capture must not escape into the tool-call hook. Lazy or guarded provider initialization prevents a missing or broken provider from disabling extension registration in observe mode.

Keep bounded pre-execution evaluation and existing deadlines. Host cancellation still cancels host work; TENET cancellation only stops assessment and records unavailability where possible. Do not mutate event arguments or release cached grants. Stale policy remains stale until reload/restart; observation continues to permit calls while showing coverage unavailable instead of silently adopting new policy bytes. Enforcement retains freshness and invocation checks.

Alternative: globally replace BLOCK with ALLOW inside decide.ts. Rejected because guard-level vetoes, approval prompts and thrown report errors would remain.

### Owner reports do not enter model conversations

Use owner UI status with a bounded recent-findings view opened by an owner command, not one notification per call. A proposed bound is 100 recent summaries with explicit eviction; retain safe structured session diagnostics where supported. Show mode, concern count and unavailable count, with details for call identity, rule line, setting, gates and scores. No raw arguments or provider prose. Do not register a reporting tool or send custom agent messages. UI-less runs use non-model records only, never protocol stdout.

Use custom non-message records and verify their model-context behavior against the pinned Pi host in integration tests. Observation records must carry explicit mode and be excluded from both live and recovered evaluator trajectory. Existing enforcement decision/approval recovery remains intact. UI status can be rebuilt from owner records without replaying them as evidence. If UI or persistence fails, observation still permits execution; it cannot promise a report when every reporting channel is broken.

Alternative: attach warnings to tool results. Rejected because the agent would see them and change behavior. Owner-only is an automatic-delivery contract, not an OS security boundary.

### Preserve counterfactual and execution distinctions in evaluation

Version diagnostic records to distinguish old enforced decisions from new counterfactual decisions. Reports identify actual permission, would-allow/would-block/would-ask and whether an assessment exists. An approval condition means would-ask, not that the owner would approve. Match execution only to observed tool results; missing results stay unknown. Do not label observation's intentional permission as an unsafe classifier allow in replay metrics. Keep false-block and unsafe-allow denominators tied to counterfactual enforcement and separately count observation permissions and evaluation failures.

## Risks / Trade-offs

- Default changes remove existing protection. Mitigation: mark the release breaking, show OBSERVE prominently and document explicit enforce configuration before upgrade.
- Invalid mode defaults to observe rather than fail-closed. Mitigation: only an exact enforce value enables enforcement, and owner startup diagnostics identify invalid values.
- Observation still adds network latency and cost. Mitigation: retain one bounded request and existing deadline; report duration without claiming zero impact.
- Observe permits policy mutation, so later coverage can become unavailable. Mitigation: retain snapshot freshness checks as findings and require explicit reload/restart to recover coverage.
- Observer records could bias future judgments or leak through host message conversion. Mitigation: live and recovery exclusion tests plus pinned-host model-context assertions.
- Suppressed reporting failures lose evidence. Mitigation: best-effort status when another channel survives; never mislabel missing coverage as passing evaluation.
- Many warnings can overwhelm the owner. Mitigation: compact counts and a bounded detail view rather than repeated popups.

## Migration Plan

1. Implement the delta without rewriting active owner policy. Update bundled examples and README to state observe is the default and show explicit BLOCK/WARN syntax.
2. Preserve legacy rules as BLOCK, but document reserved-prefix collisions. Existing enforcing users set `TENET_MODE=enforce` before restarting the upgraded process.
3. Keep all pre-existing fail-closed and approval regressions with explicit enforce mode; add default-observe and owner-only coverage. Update record consumers and replay labels for the new record version without relabeling historical results.
4. Run offline tests, pinned Pi smoke tests, type checking and diff checks. No live TypeSafe calls are authorized by this change.
5. Rollback requires restoring prior code and legacy policy syntax externally, then a full restart. Prior versions ignore TENET_MODE and block by default; warn owners that rollback does not preserve observation behavior.
