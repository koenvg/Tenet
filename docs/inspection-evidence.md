# Inspection evidence preparation

TENET-21 centralizes evidence preparation without changing submitted evidence or enforcement. The implementation base is `2c5d4b7c15ead7f0ef887dc36785160e175e9bc6`. The source proposal is [PR 55](https://github.com/koenvg/Tenet/pull/55). Coverage diagnostics, new per-event bounds, duplicate compaction and call/result selection are later tasks, not runtime modes in this slice.

## Shared contract

`src/decision/history-selection.ts` owns history normalization, credential omission, configured sensitive-field redaction, SDK admission, immutable snapshots and FIFO selection. It has no command vocabulary, rule-text classification or tool-name exemptions.

`Observations` in `trajectory.ts` is the host-facing collection interface. Live observations and recovered branch events use `add`; caller-supplied SDK history uses `addHistory`. Both delegate to `HistoryPreparation`. Recovery adapters still choose the eligible branch and event provenance. The SDK still checks session readiness and activation before replacing history. Neither adapter implements selection rules.

`boundEvidence` in `judge-evidence.ts` delegates final preparation to `prepareRequest`. It supplies only the byte measurement of the exact `judgeState` projection. The same private FIFO selector handles event-count and byte eviction at admission and final preparation. Final preparation does not mutate retained history.

Preparation preserves the existing phases and allowances:

1. The default limits are 12 recent events and 24 KiB. An observation normalizes unsupported content to explicit markers, omits credential fields and applies configured redactions. If its sanitized payload exceeds the byte allowance, it becomes `observation-byte-limit`. Admission drops oldest events until the observation array fits the count and serialized UTF-8 byte limits.
2. SDK history retains its existing bounded inspection behavior. The excluded prefix counts as omitted without reading it, including with zero retained events. Unsupported entry kinds and raw entries rejected by `evidenceWithinBudget` count as omitted. Oversized SDK entries are excluded, not converted to the live oversized-observation marker. This difference is preserved inside the shared module.
3. Final preparation first applies the event count. If the exact submitted state is too large, it drops optional tool description and schema before history. It then drops oldest observations until the state fits. The byte measurement includes policy, integrity text, current action and resolved facts, not just the history array.
4. If required current evidence still cannot fit with zero history and no optional tool metadata, preparation returns `null`. `decide` returns `BLOCK` with `insufficient-evidence` and does not call the judge.

Order means ingestion or selected-branch order, not timestamp sorting. Provenance, timestamps and omission counts remain intact. Copies are deeply frozen and detached from host content; later events cannot alter an in-flight request. Existing limitation order is unchanged, including duplicate `history-omitted` markers when both phases omit events. Runtime session/context ownership and lifecycle invalidation remain unchanged.

## Evidence is not authority

Preparation never rewrites pending arguments or current resolved facts. It cannot promote a historical `authenticated-complete` claim into top-level `resolvedAction`, nor turn a historical approval into invocation-local permission. Only the configured trusted resolver can authenticate current facts. Stock Pi and Claude adapters still report unsupported resolution; cleaner history does not certify execution effects.

The `applicability-v1` contract, integrity checks, WARN handling, FAIL and UNKNOWN gates, outcome/evidence-confidence thresholds, INSUFFICIENT gate and applicability validation are unchanged. Enforcement still requires fresh policy and unchanged invocation identity/arguments. ASK still requires trusted approval for that invocation. Observe mode still permits independently of its counterfactual findings.

## Regression seams

The task acceptance criteria establish these offline test boundaries:

- Captured injected-judge requests and resulting decisions through `decide` and the Pi/SDK guard entry points.
- Immutable `Observations.snapshot()` values, including unsupported-content markers and missing metadata.
- Compiled SDK `setHistory` admission and permission/assessment results. No fixture tool action is dispatched.
- Existing owner-event, recording and inspector projections in the broader required suite. This slice adds no projection fields or record versions.

`test/evidence-preparation.test.ts` contains authored synthetic, complete submitted-request baselines for count limits, zero history, UTF-8 admission and final byte pressure, oversized observations, chronological recovery and insufficient capacity. These expectations passed against the pre-change implementation before the runtime refactor. They are not snapshots regenerated from the new preparer. `test/sdk-history.test.ts` pins SDK trajectory provenance, omissions, redaction, missing metadata and permission/assessment outcomes, including a throwing getter in excluded history.

Existing trajectory, resolved-action, applicability, approval, owner-reporting and host parity tests cover frozen snapshots, session isolation, protected current facts, unsupported applicability and unchanged enforcement behavior. These offline scripted tests establish mechanical equivalence, not live evaluator accuracy.

For required checks, see [CONTRIBUTING.md](../CONTRIBUTING.md). Completion results and the single fresh-context review are recorded in [TENET-21 handoff](TENET-21-handoff.md).
