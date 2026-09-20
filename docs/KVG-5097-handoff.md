# KVG-5097 handoff

## Delivered

- `eval/publication-demo-README.md`: opt-in operator procedure, primary-agent negative prompt, directed fallback cases, separate positive tasks, Arc requirement, independent checks, reporting and separately authorized cleanup.
- `eval/publication-demo.ts`: preflight attestation validation and evidence-ledger summaries. No publisher, credential handling or replacement executor. Report entries require supporting observations; the module does not authenticate transcripts.
- `eval/publication-remote.ts`: injected read-only GitHub verifier for expected file/ref SHAs and known blob visibility. Other services can supply the same evidence contract without changing guard policy. GitHub absence checks never establish absence of intermediate uploads.
- Two offline test files cover prerequisites, reporting, remote uncertainty and six fresh guard invocations across three publication forms. Three denials dispatch nothing; three positive approvals dispatch only their own fake invocation. The dummy API tool is not claimed as available live.
- Existing runtime guard, selected policy and dependencies are unchanged.

## Verification observed

- Red checkpoint: the new demonstration test failed because its implementation module did not yet exist.
- Installed pinned dependencies with `bun install --frozen-lockfile`; lockfile unchanged.
- `bun test`: 105 passed, 0 failed, 13 files. Includes pinned Pi smoke tests.
- `bun run typecheck`: passed.
- No external model requests, remote publication, browser sessions or cleanup were used for verification.

Offline tests establish mechanics and report accounting, not live semantic quality. Fake executor success does not count as remotely approved-task completion. Existing semantic replay results retain their own failures and limitations.

## Live report: not run

| Item | Observed status |
| --- | --- |
| Explicit live-run authorization | Not supplied |
| Controlled destination confirmation | Not supplied |
| Destination/TypeSafe credential checks | Not performed |
| Selected live Pi tool inventory and readiness | Not collected |
| Primary-agent live attempts | 0 |
| Directed live attempts | 0 |
| Positive live approvals and completed publications | 0 |
| Independent remote checks | Not performed |
| Live prompts per task | Not measured, no live task |
| Live judge/gate latency and human wait | Not measured |
| Browser/Arc connectivity | Not checked; no selected browser case |
| Cleanup | Not authorized or performed |

OpenSpec 5.3 remains open. Do not label this a completed live cross-tool demonstration. After explicit authorization, perform preflight and record actual evidence using the procedure. Keep primary-agent stopping/refusal, unavailable forms, provider errors, semantic failures, host dispatch gaps and remote uncertainty visible.

## Limits relevant to the next run

The bundled policy prohibits agent-created commits in addition to unapproved publication. An operator-prepared commit or externally selected publication-only demonstration policy may be needed; do not ask the guarded agent to weaken policy. A correct block under the commit prohibition is not a publication-classification success.

Default audit records do not measure time spent reviewing the UI. Obtain independent timing or leave it unknown. A block record alone does not prove the host skipped dispatch. The ledger accepts curated evidence, not unverified success inferred from missing events. GitHub cannot enumerate all intermediate/dangling objects through the verifier. Even visible blobs may predate a call. `liveComplete` describes observed selected cases, while `deniedVerified` requires stronger service evidence and stays zero for ordinary REST absence checks.

No subagents were launched. No commit or push was made.
