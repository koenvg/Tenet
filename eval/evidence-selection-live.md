# Bounded live evidence-selection comparison

This is a separate command from the strictly offline `evidence-selection-replay.ts` and the unrelated publication experiment `semantic-cli.ts`.

The campaign can observe provider replies, request wall latency and returned usage. Its labels are authored mechanical expectations, not independently adjudicated semantic truth. In particular, forged-facts and stale-facts have identical inputs on each side and differ only in their offline response scripts. Supported PASS/NOT_APPLICABLE replies are visible disagreements with authored protection labels, not demonstrated unsafe behavior or regressions. This campaign does not establish general accuracy or safety.

## Sequencing and command

Only after the parent accepts no-network readiness and sends GO LIVE:

```sh
TMPDIR=/tmp bun eval/evidence-selection-live-cli.ts --live --authorize-evidence-disclosure
```

Authentication comes from the existing `TYPESAFE_API_KEY` environment value. Do not print it, put it on a command line or copy a secret file. The command requires `BB_THREAD_STORAGE` and accepts no output, model, fixture, policy, endpoint, resume or execution override. Importing the command does not send requests. All ordinary validation runs remove real credentials and inject SDK-shaped Fetch replies.

There are 17 original synthetic pairs, in original order, baseline first then candidate. At most 34 TypeSafe/Jev requests, sequentially, with no retries, replacement requests, deduplication or probes. The three unavailable/invalid/skipped controls remain offline. Only pinned synthetic policy/evidence plus the existing generic assessment protocol enters request bodies. Labels, scripts, categories and report annotations never enter requests.

The input manifest verifies raw fixture/report hashes, the authored checkpoint, fixture/policy digests and each original payload/question digest. Current generic questions, model/profile/thresholds and regenerated candidate selection must still agree. Baseline is authored-inline-v1, not historical runtime behavior. Its original prepared snapshot goes straight to the production Jev judge without current history rebounding. The production decide gate receives identical protected current facts, not a new baseline selector. Its preparation diagnostic is not reported as submitted baseline/candidate coverage. Production code and behavior are unchanged.

## Durable outputs and stops

The fixed directory is `$BB_THREAD_STORAGE/tenet29-live/`. Do not create, delete, move or replace it to rerun a campaign.

- `manifest.json` contains all 34 exact application payloads, digests, authored labels and representation/contract identities. It is not a session export.
- `attempts.jsonl` is the append-only, fsynced dispatch/result journal. Each dispatch intent consumes an entry before Fetch. The in-flight report checkpoint also completes before Fetch.
- `report.json` and `report.md` are fsynced atomic checkpoints containing all planned rows, including failures and unattempted rows. The original offline reports are never overwritten.

The directory is reserved exclusively with mode 0700; files use 0600. Existing directories, aliases/symlinks, replaced journals and unsafe outputs fail closed. There is no automatic resume or reset. After a crash the manifest and journal identify consumed entries. An intent without a settled result is spent and ambiguous; do not use an older checkpoint as permission to resend it. A durability failure can leave an earlier report checkpoint, so reconcile the journal before interpreting counts. Never launch a replacement campaign to recover missing outputs.

The exact destination is HTTPS POST `https://api.typesafe.ai/v1/systemone`. Production SDK logging is off and retries are zero at client and call levels. Eval Fetch verifies destination, method and exact body and forces `redirect: 'error'`. HTTP auth/quota/configuration rejection, redirects, timeout/cancellation, ambiguous transport settlement or durability failure stop further dispatches. Settled 5xx failures remain original failures and are not replaced. Unknown connection settlement is conservatively spent. HTTP error bodies, headers, credentials and arbitrary exception messages are not saved or logged.
The eval transport waits for the full response body inside its stop boundary, separately from judge completion. Body-transfer failure after either success or error headers is spent and ambiguous, not an ordinary settled provider failure. Incomplete responses do not supply returned model or usage.

The production deadline stays 2500 ms with the real monotonic clock and AbortSignal. The report's request-wall latency includes SDK validation and local overhead; it is not provider-only inference time. Returned usage/model are observations, never inferred from bytes. Missing values remain null. No token, cost or accuracy estimate comes from request sizes.

## Fixed reporting

Keep 20 corpus cases, 19 authored-protected corpus cases, 17 planned live pairs, 16 authored-protected live cases, 1 benign live case, 7 authored violation expectations, and 3 separately excluded offline controls. Per-side planned metrics use 17; ALLOWs against authored protection and protected unassessed use 16; benign blocks use 1. Failures do not shrink these denominators. The unchanged excluded controls have explicitly offline results and zero live submissions.
Paired decision, per-rule outcome, selected-FAIL and uncertainty-only BLOCK transitions derive only from actual validated gates. The paired change counts and unavailable-pair count each use the fixed denominator 17. If either side lacks a validated assessment, its pair's transitions are null, not inferred from fallback BLOCK or authored scripts. Opposing transitions remain visible even when per-side totals cancel. These are mechanical changes, not established semantic regressions or improvements.

Independent outcome distributions, applicability references, integrity outcomes, gate diagnostics, approval and mechanical observe/enforce projections remain visible. ASK has no approval. No fixture executor or dispatcher exists. Byte reductions, exact compaction, shortening, drops and omissions are distinct. Neither missing history nor UNKNOWN turning into BLOCK proves semantic correctness.

Public offline tests exercise the manifest, separate CLI, campaign entry point with injected Fetch, real production validation/decision projection and durable filesystem campaign. The frozen offline runner/report tests remain the regression check for unchanged prior artifacts. TENET-29 readiness must include local commit/tree, clean status, the 34-payload manifest, test/review evidence, fixed output location and confirmation of zero real requests before GO LIVE.
