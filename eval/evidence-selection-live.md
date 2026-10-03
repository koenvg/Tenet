# Bounded live evidence-selection comparison

Use this developer-checkout guide to check campaign readiness offline, then run a separately authorized TypeSafe/Jev comparison. The live command is separate from strictly offline `evidence-selection-replay.ts` and the unrelated publication experiment `semantic-cli.ts`. No fixture executor or dispatcher exists.

This campaign observes provider replies, request-wall latency, and returned usage. Its labels are authored mechanical expectations, not independently adjudicated semantic truth. It does not establish general accuracy or safety.

## Check readiness offline

1. Complete [development setup](../CONTRIBUTING.md#set-up). Use Bun 1.3.14+ and Node 22.19+ for checkout validation. Remove real credentials from the validation environment.
2. From the repository root, run the injected-response checks:

   ```sh
   bun run sdk:build
   bun test --isolate --max-concurrency=1 --timeout=30000 test/evidence-selection-live.test.ts test/evidence-selection-report.test.ts
   bun run typecheck
   ```

3. Expect passing tests and zero exit codes. Follow [the full offline validation order](../CONTRIBUTING.md#check-a-change) for the complete suite.
4. Before GO LIVE, retain TENET-29 readiness evidence: local commit/tree, clean status, the 34-payload manifest, test/review evidence, fixed output location, and confirmation of zero real requests. The parent must accept this no-network readiness before authorizing live work.

Ordinary validation injects SDK-shaped Fetch replies. Public offline tests cover the manifest, separate CLI, campaign entry point with injected Fetch, real production validation/decision projection, and durable filesystem campaign. Frozen offline runner/report tests check that prior artifacts stay unchanged.

## Sequencing and command

Obtain separate authorization before this live path. Only proceed after the parent accepts no-network readiness and sends GO LIVE. This authorization does not permit fixture execution or remote publication.

The command sends pinned synthetic policy/evidence and the existing generic assessment protocol to TypeSafe/Jev at HTTPS POST `https://api.typesafe.ai/v1/systemone`. It consumes API quota. Labels, scripts, categories, and report annotations never enter requests.

1. Confirm the authorized limit of at most 34 requests. There are 17 original synthetic pairs, in original order, baseline first then candidate. Requests are sequential, with no retries, replacement requests, deduplication, or probes. The three unavailable/invalid/skipped controls stay offline.
2. Confirm `TYPESAFE_API_KEY` and `BB_THREAD_STORAGE` are available through the environment. Do not print the key, put it on a command line, or copy a secret file.
3. Confirm `$BB_THREAD_STORAGE/tenet29-live/` does not already exist. Do not create, delete, move, or replace it to rerun a campaign. The command reserves this fixed output directory itself.
4. From the repository root, run only after GO LIVE:

   ```sh
   TMPDIR=/tmp bun eval/evidence-selection-live-cli.ts --live --authorize-evidence-disclosure
   ```

5. Expect a `Campaign stopped. Spent .../34` message and durable outputs in the fixed directory. Exit zero means all 34 requests completed without a stop reason. It is not an accuracy or safety pass. Read the journal and report together before interpreting counts.

The command accepts no output, model, fixture, policy, endpoint, resume, or execution override. Importing it does not send requests.

### Check what the comparison submits

The input manifest checks raw fixture/report hashes, the authored checkpoint, fixture/policy digests, and each original payload/question digest. Current generic questions, model/profile/thresholds, and regenerated candidate selection must still agree.

Baseline is `authored-inline-v1`, not historical runtime behavior. Its original prepared snapshot goes directly to the production Jev judge without current history rebounding. The production decide gate receives identical protected current facts, not a new baseline selector. Its preparation diagnostic is not reported as submitted baseline/candidate coverage. Production code and behavior are unchanged.

Forged-facts and stale-facts have identical inputs on each side. They differ only in offline response scripts. Supported PASS/NOT_APPLICABLE replies disagree with authored protection labels; they do not demonstrate unsafe behavior or regressions.

## Durable outputs and stops

The fixed directory is `$BB_THREAD_STORAGE/tenet29-live/`. It is reserved exclusively with mode 0700; files use 0600. Original offline reports are never overwritten.

| File | What it retains |
| --- | --- |
| `manifest.json` | All 34 exact application payloads, digests, authored labels, and representation/contract identities. It is not a session export. |
| `attempts.jsonl` | An append-only, fsynced dispatch/result journal. Dispatch intent consumes an entry before Fetch. The in-flight report checkpoint also completes before Fetch. |
| `report.json`, `report.md` | Fsynced atomic checkpoints with all planned rows, including failures and unattempted rows. |

### The campaign refuses or stops

- Existing directories, aliases/symlinks, replaced journals, and unsafe outputs fail closed. Do not reset or automatically resume.
- After a crash, use the manifest and journal to identify consumed entries. An intent without a settled result is spent and ambiguous. An older checkpoint does not authorize resending it.
- A durability failure can leave an earlier report checkpoint. Reconcile the journal before reading counts. Never launch a replacement campaign to recover missing outputs.
- HTTP auth/quota/configuration rejection, redirects, timeout/cancellation, ambiguous transport settlement, or durability failure stop further dispatches. Settled 5xx failures stay as failures and are not replaced. Unknown connection settlement is conservatively spent.

Production SDK logging is off. Client and call retries are zero. Eval Fetch checks the destination, method, and exact body, and forces `redirect: 'error'`. It never saves or logs HTTP error bodies, headers, credentials, or arbitrary exception messages.

The eval transport waits for the full response body inside its stop boundary, separately from judge completion. Body-transfer failure after success or error headers is spent and ambiguous, not an ordinary settled provider failure. Incomplete responses supply no returned model or usage.

### Read latency and usage without estimates

The production deadline stays 2500 ms with a real monotonic clock and AbortSignal. Request-wall latency includes SDK validation and local overhead; it is not provider-only inference time.

Returned usage/model are observations, never inferred from bytes. Missing values stay null. Request sizes do not establish token, cost, or accuracy estimates.

## Fixed reporting

Keep the fixed corpus counts:

- 20 corpus cases and 19 authored-protected corpus cases.
- 17 planned live pairs, with 16 authored-protected live cases and 1 benign live case.
- 7 authored violation expectations and 3 separately excluded offline controls.

| Measure | Fixed denominator |
| --- | --- |
| Per-side planned metrics | 17 |
| ALLOWs against authored protection and protected unassessed | 16 |
| Benign blocks | 1 |
| Each paired change count and unavailable-pair count | 17 |

Failures do not shrink these denominators. The unchanged excluded controls have explicitly offline results and zero live submissions.

Paired decision, per-rule outcome, selected-FAIL, and uncertainty-only BLOCK transitions come only from actual validated gates. If either side lacks a validated assessment, the pair's transitions are null. Do not infer them from fallback BLOCK or authored scripts. Keep opposing transitions visible even when per-side totals cancel. These are mechanical changes, not established semantic regressions or improvements.

Keep independent outcome distributions, applicability references, integrity outcomes, gate diagnostics, approval, and mechanical observe/enforce projections visible. ASK has no approval. Byte reductions, exact compaction, shortening, drops, and omissions are distinct. Missing history or UNKNOWN becoming BLOCK does not prove semantic correctness.
