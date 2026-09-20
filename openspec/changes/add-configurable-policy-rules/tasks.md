## 1. Policy set and bounded loading

- [x] 1.1 Replace the single-policy decision contracts with immutable policy sets and identified per-rule assessments; migrate test builders and verify the new contract shapes with typechecking and focused contract tests.
- [x] 1.2 Implement explicit `Rule;` line parsing, source-line identities, duplicate preservation, strict UTF-8 handling and complete-policy rejection for invalid declarations; verify tests cover whitespace, LF/CRLF, extra semicolons, inert prose, fenced declarations and unprefixed legacy input.
- [x] 1.3 Add bounded source loading (64 KiB), at most 16 user rules and at most 4096 UTF-8 bytes per rule, source/target resolution and original-byte snapshot hashing; verify exact-limit and over-limit tests, missing/unreadable files and immutable snapshot behavior.

## 2. Generic Jev assessment and aggregation

- [x] 2.1 Replace publication-only questions with versioned per-rule outcome/evidence questions and a reserved built-in policy-integrity constraint; verify offline request-shape tests preserve full rule text, explicit approval exceptions, publication upload coverage and the distinction between trusted state and untrusted action evidence.
- [x] 2.2 Submit the complete question set in one SDK request and validate its exact answer set, distributions, identities and choice types; verify scripted-fetch tests reject missing, extra, duplicate/internal-ID-mismatched and malformed results, including APPROVAL_REQUIRED for the built-in unconditional constraint.
- [x] 2.3 Implement deterministic complete-set aggregation and contributing rule IDs; verify table-driven and permutation tests for all-pass, approval, fail, unknown, conflicting rules, insufficient evidence and threshold boundaries without averaging or overrides.
- [x] 2.4 Preserve the complete-assessment 2500 ms deadline, disabled retries, cancellation and existing threshold configuration names/defaults; verify fake-clock and scripted-provider failure tests and ensure no partial response authorizes execution.

## 3. Policy integrity and Pi integration

- [x] 3.1 Supply trusted working directory, selected policy source and resolved target with copied/redacted action evidence through the existing generic hook; verify evidence tests preserve executor input, redact configured fields and introduce no tool-name bypasses.
- [x] 3.2 Add bounded policy freshness verification before release, latching a stale snapshot until session-start reload; verify temporary-file tests for changed bytes, missing files, symlink retargeting and changes while a native approval is pending.
- [x] 3.3 Integrate the non-overridable integrity result with Pi blocking; verify scripted-judge cases for direct edits, shell sequences, rename/parent replacement, symlink routes, unfamiliar tools, policy reads, opaque effects and user rules purporting to permit policy edits. Assert dummy executors never run for blocked cases; do not claim these scripted judgments establish live semantic accuracy.
- [x] 3.4 Generalize native confirmation to list every approval-requiring rule and retain invocation-local release; verify multi-rule prompts, denial/dismissal, missing UI, UI failure, cancellation, argument changes and no reuse of approval on a later call.
- [x] 3.5 Update startup/status and staged audit records with rule count, snapshot-bound rule IDs, question version and combined reasons; verify records separate permission from observed execution and do not add raw argument or unsolicited provider-prose logging.

## 4. Regression coverage and migration documentation

- [x] 4.1 Add offline generic-rule regression fixtures covering hard prohibitions, explicit approval exceptions, irrelevant rules, conflicting rules, unavailable history, material redaction and prompt-injection text; verify new fixtures run without network or fixture-action execution and keep old v3 reports clearly historical.
- [x] 4.2 Adapt the pinned Pi production-entry and dispatch smoke tests for multi-rule evaluation and policy integrity; verify `bun run smoke` loads the new question version and blocked dummy tools never execute.
- [x] 4.3 Prepare the bundled explicit publication rule and update README/handoff documentation with the format, limits, owner-only policy migration, provider disclosure, semantic limitations, restart behavior and rollback loss of coverage; verify documentation examples parse in offline tests. If the bundled file is the active protected policy, require the owner to perform its edit externally rather than bypassing the guard. The owner subsequently explicitly authorized the agent to make the one-line source-file migration; no runtime override was added.
- [x] 4.4 Run `bun test`, `bun run smoke`, `bun run typecheck`, `git diff --check` and strict validation of this change; record results, the absence of live generic-rule validation, and the pre-archive need to reconcile the older publication-only delta specs without marking their deferred tasks complete.
