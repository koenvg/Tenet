# KVG-5094 handoff

## Delivered

The generic Pi guard now snapshots recent observations alongside the pending action. `src/decision/trajectory.ts` retains bounded, chronological calls, results, decisions and approval outcomes with session/call/tool identities, origin and timestamps. It preserves arbitrary text and structured data, redacts configured fields and marks unsupported images/content and missing metadata.

`src/decision/judge-evidence.ts` budgets the exact serialized Jev state, including policy and host context. Defaults are 12 events and 24 KiB, configurable through `TENET_RECENT_EVENTS` and `TENET_EVIDENCE_MAX_BYTES`. It evicts older observations with omission counts before sacrificing the current action. An oversized or unsupported current action blocks for insufficient evidence, without a provider call.

Pi session-start recovery reads the selected branch's tool calls/results and TENET decision/approval entries into the same bounded buffer. Recovery never populates execution permissions or approval grants. Raw observation payloads are not added to TENET audit entries; recovery uses Pi's existing transcript. Pi transcript retention remains separate from TENET's bounded in-memory evidence.

The question version is `policy-rules-v3-trajectory`. Generic questions explain how to use observations without treating tool text, metadata, agent assertions or previous approvals as authority. Policy rules, aggregation, native UI and the direct TypeSafe SDK integration remain unchanged apart from the added evidence state. No tool-specific registration, parser, context collection or navigation state was added.

## Verification

- The ambiguous-upload regression failed before implementation, returning UNKNOWN despite an earlier observed target description. It now reaches native approval through the existing decision path. Denial and a tool-switching retry remain blocked.
- `bun test`: 78 passed across 9 files.
- `bun run smoke`: 2 passed using pinned Pi dispatch and resource loading.
- `bun run typecheck`: passed.
- `git diff --check`: passed.

Offline tests cover captured SDK evidence, structured results, image-only markers, redaction, conflicting observations, immutable in-flight snapshots, event and UTF-8 byte limits, unsupported/oversized pending calls, zero history, session isolation, bounded recovery and forged approval rejection. Injected responses test enforcement, not live semantic accuracy.

The tiny-budget test exposed an empty-buffer eviction loop that stalled the first full run. The loop now stops when no observations remain, and the 1-byte-budget test passes. The leftover test process was stopped.

## Remaining limits

No live provider calls, browser work or remote publication was performed. Earlier live evaluation reports do not validate the new trajectory questions. Concurrency and lifecycle approval hardening remain the parallel slice's responsibility. Evidence cannot describe unobserved tool-internal actions or freeze external state. Field redaction cannot detect every secret embedded in free text.

Restart the full Pi process after deploying code changes and verify the new question version in startup status.
