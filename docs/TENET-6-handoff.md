# TENET-6 handoff

## Result

Precision accommodation is unsupported. No rounding adapter, renormalization, configurable tolerance, or threshold change was added. The existing absolute unit-sum check remains `0.000001` for both injected judges and TypeSafe responses. A distribution totaling 0.99 remains invalid even if its selected score meets a threshold.

One optional `validationIssue` code identifies the first response defect: `response-shape`, `labels`, `score-range`, `unit-sum`, or `selected-choice`. Diagnostics contain no returned labels, numeric payloads, provider prose or exception messages. SDK confidence range errors are distinguished from answer shape errors. Evidence and fact-reference distributions use the same strict checks as outcomes.

The overall reason remains `invalid-response`; no rule assessment or semantic violation is fabricated. Enforce blocks. Observe retains released permission and reports an unavailable assessment, with no inferred would-decision. Owner detail and inspector notices explain unsupported precision. The diagnostic remains available after recovery and archive reading. Historical records without a code are not revalidated or given an inferred diagnosis.

Existing opt-in/out archive response capture is unchanged: bounded raw response snapshots remain separate from sanitized diagnostics and can contain sensitive submitted or returned text. No new raw logging was introduced.

## Contract investigation

Checked public documentation on 2026-09-27, without sending evaluator requests:

- [TypeSafe Choice](https://docs.typesafe.ai/primitives/choice): `choice` is the highest-probability option; the full distribution sums to 1.
- [TypeSafe API](https://docs.typesafe.ai/api): typed answer and probability fields, without a verified normative rounding precision or interval guarantee.
- [TypeSafe confidence](https://docs.typesafe.ai/confidence): confidence derives from distribution shape; it is not the selected probability used by Tenet's gates.
- Installed `@typesafe-ai/sdk` 0.6.0 README and `dist/index.d.mts`: numeric probability maps, no rounding-error bounds. README points to the public docs above.

These sources do not establish a precision contract for deployed `jev-latest`. Two-decimal examples and recorded 0.99 sums are not guarantees. There is consequently no enabled adapter version and no interval-adapter test claiming provider correctness. A future adapter requires a separately verified versioned contract and conservative threshold and ordering checks.

## Verification

Baseline: `54eb7dd4cc077b165634bdf4f35e1ca2f8df9cbe`. Working tree was clean before implementation.

- Test-first checkpoint: 15 response-diagnostic tests failed before implementation.
- `bun run inspector:build`: passed.
- `TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000`: 482 passed, zero failures.
- `bun run typecheck`: passed.
- `bun run inspector:check`: zero errors and warnings.
- `CI=1 bun run inspector:test`: 16 component and 24 browser integration tests passed.

The first full suite hit missing nested BB plugin dependencies and macOS Unix-socket path limits. Installed the nested package dependencies without retaining the generated lockfile, then reran with `TMPDIR=/tmp`. No runtime socket limit was weakened. An initial UI assertion used Vitest's text matcher incorrectly; direct DOM text assertions and desktop/mobile width checks now pass.

New coverage includes injected and scripted SDK failures, nonfinite and out-of-range scores, unknown and missing labels, selected ordering, 0.99 distributions around thresholds and alongside independent blockers, raw-response separation, live and recovered owner reports, archive history, and inspector notices at 1280px and 390px. Existing suites cover exact threshold gates, WARN, integrity, approval and applicability behavior. All fixtures are offline; none establishes live semantic accuracy.

## Completion review

The single fresh-context read-only review approved the complete working-tree diff with no blocking findings. The reviewer independently reran 25 focused tests, all passed; full-suite and browser results were supplied rather than rerun. Review run: `e61e8aae-07b5-4be3-83f1-c5d3b0a1d94f`.

No live evaluator calls, service restarts, commits or pushes were performed.
