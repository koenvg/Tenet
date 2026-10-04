# Tasks

## 1. Shared policy selection

- [ ] 1.1 Add disposable owner-home fixtures for policy discovery, SDK subprocesses, and guard harnesses before changing defaults. Verify tests cannot read or modify the owner's `~/.tenet/TENET.md` and existing project-only fixtures remain independent of the real home.
- [ ] 1.2 Add failing selection tests for global-only, project-only, combined, no-source, relative/absolute project overrides, empty overrides, broken links, and filesystem uncertainty. Verify both observe and enforce expectations and that a project override never removes the global candidate.
- [ ] 1.3 Implement one shared candidate selector and update runtime configuration/startup selection. Verify the selection tests pass without parent search, bundled fallback, or a new global-path override.
- [ ] 1.4 Update `docs/configuration.md` and the selection section of `docs/policy.md` with the two-source contract and eligibility table. Verify every row against the selection tests and review both changed pages against all 18 writing-guide items.

## 2. Complete bounded policy snapshots

- [ ] 2.1 Add failing composition tests in `test/policy.test.ts` for source-qualified IDs, original physical lines, global-first ordering, per-rule severity/thresholds, identical files, and the same target selected twice. Verify all declarations remain distinct and shared-target snapshots cannot disagree.
- [ ] 2.2 Replace singular policy contracts with immutable candidate/source sets and a versioned combined digest; keep one combined evaluator rule list. Verify deterministic identity, source provenance, frozen snapshots, and sensitivity to bytes, target, or candidate presence changes.
- [ ] 2.3 Enforce complete-set limits and reject partial enforcement. Verify exactly 16 declarations and 64 KiB are accepted, over-limit totals fail, each rule retains the 4096-byte bound, and empty/malformed/unreadable present sources invalidate the entire set.
- [ ] 2.4 Update `docs/policy.md` grammar/limit guidance and `docs/limits.md` for shared budgets and duplicate role occurrences. Verify documented boundaries against tests and review all changed pages against the 18-item checklist.

## 3. Assessment, integrity, and lifecycle

- [ ] 3.1 Add offline decision and evidence regressions for conflicting global/project permissions, BLOCK/WARN differences, independent threshold overrides, and global rules in project-free sessions. Verify injected assessments preserve existing aggregation, authenticated-fact requirements, and invocation-local approvals without live provider calls.
- [ ] 3.2 Update evaluator evidence and built-in integrity to cover every source, resolved target, alias, parent operation, and absent selected candidate. Version changed integrity/evidence/question contracts as required. Verify mutation or creation of either policy candidate cannot be authorized by user rules or an approval exception.
- [ ] 3.3 Extend freshness checks and approval/background-assessment cancellation to the whole source set. Verify deletion, unreadability, edits, same-byte link retargeting, candidate appearance, and changes during approval invalidate the full snapshot; observe permits without a pass and enforce blocks.
- [ ] 3.4 Update `test/session-policy-activation.test.ts`, SDK lifecycle tests, and activation tests for dormant startup, reload, active source appearance, off/on, and missing credentials. Verify no-policy sessions stay silent and off never turns a stale policy into a valid one.
- [ ] 3.5 Update owner-only policy management and reload guidance in `docs/policy.md` and runtime behavior in `docs/shared-runtime.md`. Verify the procedures match lifecycle tests and retain approval, disclosure, observation, and host-boundary warnings; review all 18 checklist items for each page.

## 4. Source-aware records and findings

- [ ] 4.1 Update current SDK readiness/finding types, owner records, and recording schemas to capture the frozen source set, combined digest, rule origin, and effective thresholds. Verify public type fixtures and recording tests reject ambiguous IDs or incomplete current provenance and do not add raw text to diagnostic output.
- [ ] 4.2 Update archive validation, replay, inspector parsing/display, Pi report consumers, and BB archive readers affected by the new contract. Verify current global/project findings show the correct file and line, and historical fixtures retain recorded single-source identities and thresholds without consulting current files or rewriting archives.
- [ ] 4.3 Add focused inspector and BB reader regressions for identical source bytes, global-only records, unavailable combined snapshots, and historical records without roles. Verify owner findings remain separate from permission and execution evidence and no agent-visible status delivery is introduced.
- [ ] 4.4 Update `docs/sdk.md` for current source-set types and historical interpretation. Verify SDK consumer/type fixtures and the offline guide example, then review the changed page against all 18 writing-guide items.

## 5. Host startup, diagnostics, and delivered setup

- [ ] 5.1 Update Pi startup/status to identify global-only and combined readiness, participating source digests, total rules, and source failures. Verify Pi/SDK parity and smoke tests, including unchanged commands and no UI in truly dormant sessions.
- [ ] 5.2 Replace the Claude hook's independent local-only eligibility logic with shared selection while retaining existing bridge generation, resume, and failure boundaries. Verify global-only sessions cannot be marked dormant, failed explicit/global sources cannot bypass enforce, and hook/bridge configuration disagreement never yields fabricated readiness in `test/claude-bridge.test.ts`.
- [ ] 5.3 Update doctor schema/text output and source-specific guidance through the shared selector. Verify `test/doctor.test.ts` covers global-only, combined, malformed global, explicit missing project, both absent, sanitization, and existing exit precedence without evaluations or filesystem writes.
- [ ] 5.4 Update maintained README, `CONTRIBUTING.md`, doctor, Claude prototype, installation, archive-operation, and related website references that claim local-only discovery. Verify source-selection statements agree, links resolve, archive instructions are self-contained, global-file authoring warns about activation/disclosure, and every changed page passes all 18 checklist items. Leave historical handoffs and sample/owner policies unchanged.
- [ ] 5.5 Extend relocated archive verification with disposable global-only and combined policy fixtures and the new SDK/doctor contracts. Verify selection uses the temporary owner home and session cwd, not the archive's installation directory, and does not alter the owner's registration or files.

## 6. Complete integration verification

- [ ] 6.1 Run the ordered offline application, SDK, inspector, and BB plugin checks from `CONTRIBUTING.md`, keeping `TYPESAFE_API_KEY` unset. Verify every command exits zero and the full suite uses isolated owner-home fixtures; report any coverage limits rather than claiming live evaluator or host accuracy.
- [ ] 6.2 Run the delivery archive lane from `CONTRIBUTING.md`, including `bun run package:archive`, the raw metadata check, and relocated consumer checks. Verify combined policy discovery, current contracts, historical readers, and no change to owner installations; report any package-registry access or skipped checks.
- [ ] 6.3 Run one fresh-context read-only completion review under the implement/code-review workflow against the complete implementation diff. Resolve blocking findings and rerun affected checks; verify review evidence is recorded without modifying unrelated cleanup or historical records.
