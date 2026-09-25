# Tasks

## 1. Freeze the regression workload

- [ ] 1.1 Add sanitized, inert fixtures to the existing evaluation tooling for file reads, brace insertion, documentation/code edits, staging, actual commits, known/unknown merge effects, compound edit-and-commit, active-policy edits and publication approval; verify every fixture has an authored expected classification and evidence limitations, and fixture loading executes no actions.
- [ ] 1.2 Add original versus clarified policy variants and raw recorded-score regressions, including 0.99 probability sums; verify legacy offline replay reproduces the specified gates and reports operational failures separately from semantic errors.
- [ ] 1.3 Document the fixed sample, sanitization method, denominators and separate live-disclosure authorization in `eval/README.md` and the applicable replay instructions; verify the documented offline command needs no credentials and no raw archive paths or secret-bearing strings are committed.

## 2. Prepare compatible records and finding views

- [ ] 2.1 Add a new recording schema for independent assessment lifecycle, absent pending would-decisions, profile/fact coverage and timing; verify recording contract tests accept result-before-assessment order and reject malformed lifecycle records while retaining schema-1/schema-2 fixtures.
- [ ] 2.2 Extend archive indexing and detail folding for mixed supported versions using unchanged historical/qualified hash identities; verify existing deep links resolve, historical thresholds remain unchanged and execution does not imply assessment completion.
- [ ] 2.3 Implement shared pure finding classification and grouping keys, then use it in summaries and Pi reports; verify PASS/low-confidence, FAIL, approval-plus-uncertainty, invalid response and pending/dropped cases have distinct overlapping categories and correct distinct-call counts.
- [ ] 2.4 Add inspector category filtering, expandable uncertainty groups and explicit coverage-loss/eviction status; verify Svelte component and browser tests retain individual invocation navigation, policy separation and owner-only reporting.
- [ ] 2.5 Expose reader build/schema compatibility status and a prominent unsupported-record notice; verify a mixed archive displays readable history without claiming complete latest coverage, and document reader-first deployment plus rebuild/restart requirements in the inspector documentation.

## 3. Add the host-supplied evidence contract

- [ ] 3.1 Add the optional resolver interface at the shared runtime seam, including integration identity, argument digest, resources, literal/executed content, snapshot binding and explicit coverage; verify forged argument fields, mismatched identities and unsupported versions cannot become authenticated facts.
- [ ] 3.2 Implement bounded resolution and pre-release revalidation with cancellation; verify contract tests cover stale anchors, changed arguments, aliases, links, parent operations, compound effects and post-resolution invalidation without introducing automatic external probing.
- [ ] 3.3 Expose optional resolver injection through the Pi registration interface and shared embedding contract, leaving default Pi/Claude coverage unsupported; verify adapter tests never infer guarantees from `getAllTools` metadata or claim a test provider certifies a deployed tool.
- [ ] 3.4 Prioritize material current facts over optional history and repeated metadata in evidence bounding; verify a large prior result does not displace a resolved current edit, omissions remain visible, and over-budget material facts remain unavailable rather than silently truncated to a safe-looking action.
- [ ] 3.5 Document the companion tool integration contract and conformance checklist, including the executor's obligation to honor a checked target binding; verify documentation explicitly states that external tool implementation and stock anchor-resolution coverage are not supplied by this repository change.

## 4. Make observation asynchronous

- [ ] 4.1 Add scheduler tests with injected clocks and stalled judges for two running jobs, 32 waiting jobs, a 1 MiB retained-snapshot bound, five-second queue age and drop-newest behavior; implement admission/expiry and verify no excess work grows memory or blocks observation permission.
- [ ] 4.2 Split the runtime's observe path into immutable capture, immediate released/pending permission and background assessment; verify `test/observe.test.ts`, `test/observe-failures.test.ts` and runtime tests prove release before an unresolved judge while enforce mode still waits.
- [ ] 4.3 Separate assessment ownership from result tracking and retain recorders until both lifecycles terminate; verify execution-before-assessment, failed execution, missing result, out-of-order responses, duplicate IDs and recording failures never produce a second permission or fabricate execution.
- [ ] 4.4 Separate agent-turn cleanup from observation-generation invalidation; verify session switch/fork/tree, context cancellation, policy staleness, off, unavailable control and shutdown suppress late work, while normal `agent_end` permits valid background assessment to finish.
- [ ] 4.5 Add separate owner callbacks for immediate permission and completed assessment across Pi and the shared Claude runtime; verify no observation diagnostics enter agent messages, protocol stdout, tool results or recovered evaluator trajectory, including after off/on and recording opt-out.
- [ ] 4.6 Document asynchronous timing, queue loss, shutdown behavior and rollback to synchronous legacy code; verify fake-delay tests show provider delay changes assessment completion time without changing observation release ordering, and report local capture overhead separately from network time.

## 5. Add opt-in applicability-aware assessment

- [ ] 5.1 Add frozen `TENET_ASSESSMENT_PROFILE` configuration with legacy default and mode-specific invalid-value handling; verify profiles are captured per invocation, cannot be changed through tool arguments, and historical decisions retain their original profile.
- [ ] 5.2 Add versioned generic questions and a fully validated candidate response contract supporting NOT_APPLICABLE and fact references; verify the pinned SDK request shape works with mocked transport in one network round trip and profile/schema mismatches are rejected. Keep legacy question identity and behavior unchanged.
- [ ] 5.3 Add deterministic applicability gates requiring complete authenticated current facts, valid fact references, stable execution bindings and the unchanged selected-outcome threshold; verify stale/partial/redacted/forged facts cannot exempt an action, while an eligible NOT_APPLICABLE result omits only that rule's evidence gate.
- [ ] 5.4 Extend diagnostics, contribution records and inspector rule views for unsupported applicability and a genuinely absent evidence gate; verify no fabricated evidence score, lost independent integrity assessment, WARN veto, approval reuse or automatic profile promotion appears.
- [ ] 5.5 Clarify only the bundled no-commit rule and add reading/staging, actual commit, compound invocation and read-prohibited-resource tests; verify original wording remains in regression fixtures, all thresholds remain unchanged and external owner policy files are untouched.
- [ ] 5.6 Document profile opt-in, unsupported-host limits, the unconditional versus approval-based policy distinction and rollback; verify examples describe experimental semantic coverage and do not claim the new profile is generally safer or production-promoted.

## 6. Diagnose provider precision conservatively

- [ ] 6.1 Add structured bounded validation reasons in the Jev/decision adapter for shape, labels, ranges, unit sum and selected-choice ordering; verify `test/jev.test.ts` rejects malformed inputs without copying provider prose or secret-bearing arguments into safe diagnostics.
- [ ] 6.2 Check the deployed SDK/provider documentation for a normative rounding-precision contract and record the source or its absence in the implementation handoff; verify that no live request is made and no tolerance is enabled solely because the archive contains 0.99 sums.
- [ ] 6.3 If a verified contract is available, implement its versioned score-interval adapter and raw-value recording; otherwise retain strict rejection with the new precision diagnostic. Verify both the enabled test contract and strict fallback, including threshold-straddling intervals, invalid selected ordering and unrelated gates that must remain blocked.
- [ ] 6.4 Document the supported provider precision version or explicit unsupported status and historical display behavior; verify no example presents renormalization or a passing offline fixture as calibrated provider correctness.

## 7. Verify integration and prepare a measured rollout

- [ ] 7.1 Extend replay reports to compare profile, wording and fact-coverage variants with separate semantic, uncertainty, unavailable, unnecessary-approval and unsafe-allow denominators; verify offline report tests retain skipped/incomplete rows and never execute fixture operations.
- [ ] 7.2 Run type checking, inspector checks, Pi smoke tests, targeted decision/runtime/recording tests, browser suites and the serialized full test suite using the repository's supported commands; verify all results and any environmental blockers are retained in the implementation handoff without claiming live host coverage.
- [ ] 7.3 Exercise the complete recorded lifecycle with injected hosts: capture, early permission, tool result, late assessment, grouping, mixed-schema restart and legacy-profile rollback; verify browser integration preserves navigation and historical identity while unsupported/newer data remains visibly incomplete.
- [ ] 7.4 Deliver a rollout checklist mapping all delta scenarios to tests and identifying unresolved production adapter coverage, provider precision status and any live-evaluation requirement; verify the default profile remains legacy and application of the change has not uploaded evidence, restarted existing services or promoted enforcement behavior.
- [ ] 7.5 Prepare, but do not execute, the separately authorized live replay command and promotion criteria; verify canonical/held-out inputs and labels are frozen, reduced false blocks and protected-control unsafe allows are measured separately, and owner approval is required before disclosure or default promotion.
