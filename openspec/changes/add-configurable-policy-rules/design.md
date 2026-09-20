## Context

See `proposal.md` for motivation and the capability spec for behavior. The current implementation already separates Pi interception from decision logic. `policy.ts` accepts a single constant sentence and snapshots original bytes; `contracts.ts` models one publication policy and one effect assessment. `questions.ts` exports publication-specific choices, and `jev.ts` submits those choices through the official SDK. `decide.ts` validates probabilities and applies fail-closed thresholds. `guard.ts` captures tool metadata and arguments, records separate stages, and rechecks invocation identity around `approval.ts`.

Tests cover the single-rule contract, injected judges, scripted SDK fetch, and the pinned Pi loader/dispatcher. The saved v3 evaluation reports describe the old publication questions. They cannot validate new generic prompts. There are no main specs yet; the existing publication change is still in progress. This design replaces its implemented single-rule path, not its deferred work.

A design is required because this change crosses decision contracts, external request shape, policy integrity and native approval behavior.

## Goals / Non-Goals

**Goals:**
- Make parsing deterministic and semantic evaluation generic while retaining a small, testable decision boundary.
- Identify every assessed rule and bind its result to the exact policy snapshot and invocation.
- Prevent user-defined rules from weakening the built-in policy-integrity constraint.
- Preserve understandable failure reasons without trusting generated prose.

**Non-Goals:**
- Arbitrary executable policy languages, model-generated policy rewrites, inferred rules from unmarked Markdown, or per-tool policy adapters.
- Execution history, filesystem exploration by the judge, general subprocess monitoring, OS access controls, or broad lifecycle/concurrency hardening.
- Automatic proof that every natural-language rule is enforceable or that a 0.90 model probability represents 90% real-world correctness.

## Decisions

### 1. Parse a small explicit format, not Markdown or model output

`loadPolicy` will return an immutable policy set containing source path, resolved target, original-byte SHA-256 and ordered entries with rule ID, source line and text. IDs will use the snapshot digest plus source line; duplicate text remains distinct. Recognize `Rule;` after trimming a line; trim the remaining text but preserve internal punctuation. CRLF and LF are accepted. Reject invalid UTF-8, zero rules and any empty declaration. Other prose is inert, but fenced code has no special meaning: a `Rule;` line inside a fence is still a declaration.

Proposed bounded defaults are 64 KiB of source bytes, 16 user rules, and 4096 UTF-8 bytes per rule. These are engineering limits rather than model-capacity claims. Read with a size bound; reject the whole policy on excess, never truncate. Document limits and test their exact boundaries. Rule text is owner configuration and is sent to TypeSafe; documentation must warn against placing secrets in it.

Alternative: a Markdown parser introduces ambiguous examples, lists and continuations. Model-based extraction could omit or invent rules. Neither is needed for the explicit line format.

### 2. Ask generic per-rule questions in one bounded SDK request

Generate two structured choices per rule: outcome and evidence sufficiency. Supply the rule set, policy identity, trusted working directory and captured action as separate structured state. Use generated safe keys based on entry position, not user text; map those keys back to snapshot IDs. Include the built-in integrity constraint as a reserved entry that user text cannot replace.

The outcome choices are PASS, APPROVAL_REQUIRED, FAIL and UNKNOWN. Questions explicitly interpret the complete rule, including exceptions; distinguish non-applicability from missing facts; treat arguments and tool descriptions as evidence rather than evaluator instructions; and prohibit accepting claimed approval as native consent. Local work is not publication merely because it could precede a future upload. Preserve the old publication policy's coverage of private repositories, source/Git-object uploads and intermediate uploads before reference updates.

One `systemOne` request shares action evidence and uses the existing overall 2500 ms deadline, cancellation and disabled retries. This avoids multiplying network requests and prevents an early passing rule from releasing a call. It does not imply statistical independence between results. Validate the exact expected answer-key set and choice types, normalized finite distributions, selected maxima and model identity before constructing the internal per-rule result set. Assign internal IDs only from the request mapping. Extra, missing or malformed answers invalidate the whole response. An APPROVAL_REQUIRED outcome for the built-in unconditional integrity constraint is invalid and blocks.

Alternative: one network request per rule adds cost and coordination without changing the public contract. Retaining LOCAL/PREPARATION/PUBLICATION as the only choices cannot describe arbitrary rules.

### 3. Keep aggregation deterministic and approval separate

The independent decision module receives the policy set, action and injected judge. For each user rule and integrity result, apply the existing two threshold gates. Any FAIL, UNKNOWN, insufficient evidence or low probability blocks. Otherwise collect every APPROVAL_REQUIRED rule; an empty collection means ALLOW and a nonempty collection means ASK. Do not vote, average scores across rules or let permissive rules override restrictive ones.

Keep `TENET_EFFECT_THRESHOLD` as the compatible environment name for the selected-outcome threshold, documenting its generalized meaning. Retain `TENET_EVIDENCE_THRESHOLD`, `TENET_JUDGE_DEADLINE_MS` and sensitive-field configuration. Introduce a distinct generic-rule question version and record it at startup and assessment. Do not relabel old reports or imply generic semantic validation from them.

Confirmation consumes the specific approval-rule set and shows their source lines/text, policy identity and redacted action. A single positive native confirmation satisfies those conditions only for the unchanged pending invocation. Deterministic failure labels derive from validated results; unsolicited model explanations are not audit input.

### 4. Make policy integrity an immutable constraint, not another editable line

Protect the selected configured path, its resolved target and replacement/redirect operations affecting either. Capture the host working directory and policy target during session initialization; fail closed if resolution or loading fails. Include these trusted facts in every assessment so unfamiliar tools and shell commands follow the same route as edit tools. For shell sequences, evidence must cover the entire proposed invocation, not just the first command. Reads are not modifications; opaque actions remain uncertain when their effects cannot be determined.

This is a semantic veto, not a filename-specific tool adapter. A hard-coded tool-name list would miss shell, plugin and future-tool routes. The built-in question and result validation are outside `TENET.md`; `Rule; Allow editing TENET.md.` cannot remove them. Explicit unconditional policy mutation never offers a confirmation escape hatch.

Immediately before releasing a call, re-resolve the selected source and compare the loaded target and byte digest. On mismatch, disappearance or read failure, block, mark the snapshot stale and require reload/restart; do not silently adopt the new file. Keep the existing invocation and guard-state checks. Owner changes outside Pi are possible, but attributing a filesystem change to an owner is not attempted.

The check closes accidental use of a stale policy during assessment/approval. It cannot freeze the filesystem between check and execution, detect every concealed hard-link alias, or stop an unobserved external process. Hidden aliases and opaque subprocesses require uncertainty rather than invented guarantees. Full OS-enforced immutability would require a separate sandbox/security boundary and is not included here.

### 5. Preserve narrow modules and audit boundaries

- `policy.ts`: bounded parsing, snapshot identity and freshness verification; no judge calls.
- `contracts.ts`: policy set, per-rule assessment and combined decision types.
- `questions.ts` / `jev.ts`: generic question construction and SDK transport/validation, with no Pi dependency.
- `decide.ts`: deadline/cancellation and complete-result aggregation.
- `evidence.ts`: immutable copied/redacted action plus trusted assessment context, without changing executor input.
- `guard.ts` / `approval.ts`: bind snapshot to invocation, show rule-aware native UI and record assessment/decision/approval/permission/execution separately.

Keep source lines and IDs in records, including the reserved integrity result. Do not add raw argument logging. Startup presents loaded count, source digest and question version, which also makes stale Bun/Pi imports visible. No new dependencies or executor are planned.

## Risks / Trade-offs

- Natural-language misclassification or prompt injection -> separate evidence from policy, strict output validation, conservative UNKNOWN handling and an offline adversarial fixture matrix. These measures do not make semantic judgment infallible.
- More rules increase latency and false blocks -> one bounded request, explicit input limits and an overall deadline. Do not lower thresholds to make a larger rule set appear successful.
- State-dependent rules lack evidence -> return UNKNOWN; document that parsing a rule is not proof it can be evaluated with action-only context.
- Policy integrity is not filesystem isolation -> expose this limitation; test direct, shell, rename, symlink and opaque cases, and avoid guarantees about hidden external state.
- Policy freshness checks add local I/O -> bound reads and fail closed. Races after the check remain part of the documented host contract.
- Contradictory rules can prevent useful work -> show contributing rule IDs; never silently disable the restrictive rule. Owners resolve conflicts externally.
- Existing delta specs overlap -> keep this change additive in the currently empty main inventory, and reconcile the earlier publication-only scope before archive. Do not mark deferred trajectory/lifecycle tasks complete.

## Migration Plan

1. Implement against the current completed publication slice; keep the older change's remaining tasks separate.
2. Change the bundled example to `Rule; Never publish code to a remote repository without explicit approval.` in the implementation phase. A deployed guard will block an agent from changing its active policy; the owner must migrate that active file externally before enabling the new version. Never add a migration bypass to runtime enforcement.
3. Document the explicit format, limits, approval semantics, unknown outcomes, policy-integrity boundary and provider disclosure. Legacy unprefixed files fail with actionable diagnostics and remain untouched.
4. Run offline decision, SDK and Pi integration suites. Preserve old saved reports as versioned historical evidence; add generic-rule fixtures without claiming live model validation.
5. Fully restart Pi for code updates because `/reload` under the pinned Bun/Pi combination can retain old imports. Policy-only owner edits can use the session-start reload path; verify count, digest and question version.
6. Rollback requires the owner to restore both the previous software and its publication-only policy file, then restart. Extra rules will not be enforced by the old version; make that loss of coverage explicit.

## Verification Strategy

Use existing injected-judge, fake-clock, scripted-fetch and real Pi dispatch seams. Test parser boundaries; exact answer-set validation; every outcome/threshold combination; permutation-invariant aggregation; unconditional versus approval-qualified prohibitions; conflicting rules; material redaction; unavailable history; policy writes via direct and unfamiliar tools; shell/rename/link cases; policy-file changes while awaiting approval; cancellation; and invocation-local confirmation. Assert blocked dummy executors never run and successful permission is not recorded as successful execution without a tool result.

Run `bun test`, `bun run smoke`, `bun run typecheck` and `git diff --check`. No ordinary test contacts TypeSafe or executes fixture commands. A separately authorized live replay would be needed to measure generic-rule semantic performance; it is not authorized by this proposal and is not implied by passing offline tests.
