# Offline assessment comparison

This is a report-only workflow. It uses the existing decision path with injected scripted responses and the revised current evidence selector and questions. It sends no provider requests and executes no fixture actions. It does not promote a candidate or change configuration.

## Produce both reports

Build the SDK and inspector before dependent tests. No provider key is needed.

```sh
env -u TYPESAFE_API_KEY TMPDIR=/tmp bun eval/applicability-replay.ts > /tmp/tenet34-report.json
env -u TYPESAFE_API_KEY TMPDIR=/tmp bun eval/applicability-replay.ts --format=markdown > /tmp/tenet34-report.md
```

The default before identity is `applicability-v1 / policy-rules-v7-evidence-selection`. No historical observations are bundled or invented. All 29 before rows are missing. All 29 current rows run scripted mechanics. The invalid-distribution control remains unavailable. Every incomplete pair stays visible, with no false-block reduction credit.

The current version is `applicability-v1 / policy-rules-v8-source-set`. Version 3 of the fixture corpus uses the current source contract; frozen versions 1 and 2 and their digests stay unchanged. The version-2 scenarios still cover ordinary unsupported reads, inert edits, metadata pressure and schema fallback. Ordinary PASS expectations stay separate from authenticated NOT_APPLICABLE controls. Fixtures are sanitized and inert. Source references identify approved work, not private recordings.

## Supply before observations

Use a sanitized JSON bundle. It contains a `contract` and `observations`. Each observation has the following fields:

- `fixtureId`, `fixtureDigest`, `policyDigest` from the authored corpus.
- `profile` and `questionVersion`, matching the declared contract and recorded result.
- `evidenceCoverage` and `omissions`, with the recorded evidence limits and loss kept visible.
- `result`, the separately supplied recorded decision with its original assessment, diagnostics, thresholds, question version, requested model and evidence context. Use null for a missing result.
- Optional `evaluationStatus`, with `complete`, `incomplete` or `unavailable`. The exact fixture user-rule ID and integrity ID must both be present exactly once. Historical IDs retain the fixture's recorded digest plus `:1`; current IDs use `project:<SHA-256 of exact fixture policy text>:1`. Other rule IDs cannot replace them. Missing expected IDs remain in `missingRuleIds`, and the row remains incomplete regardless of this field.
- Optional `questionDigest`, `payloadDigest`, `submittedState`, `origin` and `contributions`. No absent value is reconstructed. A declared common contract `questionDigest` must match every supplied observation. Policy-specific question digests can instead remain per observation.

For an entirely missing historical side, this is a valid bundle:

```json
{
  "contract": {
    "profile": "applicability-v1",
    "questionVersion": "policy-rules-v6-applicability"
  },
  "observations": []
}
```

```sh
env -u TYPESAFE_API_KEY TMPDIR=/tmp bun eval/applicability-replay.ts --before=/tmp/sanitized-before.json > /tmp/tenet34-report.json
```

`compareApplicability` also accepts two or more separately supplied sets directly. Contracts, rows and summaries use the profile/version pair. The first contract is the before side for each later contract. Duplicate pairs and duplicate observations within a pair fail. Fixture, policy, result profile, question version and declared question-digest mismatches fail. A historical observation can use the unchanged fixture identity, but cannot acquire the current expected outcome or classification score. The comparator does not rerun old questions or compute old gates under current thresholds.

## Read the counts

- False blocks and unnecessary approvals use observed benign decisions. These include conservative BLOCK or ASK decisions with unavailable or incomplete evaluation.
- Unsafe allows use observed protected decisions, including incomplete evaluation. They remain visible even when benign blocks fall.
- Missing results, unavailable assessments and incomplete evaluations each use the full planned-row count.
- Selected violations use rows with a recorded assessment or diagnostic gates. They can overlap with uncertainty and unsafe permission.
- Uncertainty-only blocks require complete rule results, a recorded BLOCK, recorded diagnostic gates and no selected violation. The denominator is complete assessments.
- Correct classifications and semantic mismatches use complete current-version assessments only. They are script checks, not model accuracy measurements.
- Paired false-block reduction requires complete before and after assessments and a transition from benign BLOCK to ALLOW. Missing, unavailable and incomplete rows cannot earn credit. Opposing changes have a separate count.
- A zero denominator gives a null rate, never an invented zero success rate.

Ordinary evidence omissions are not automatically incomplete evaluation. The complete rule decides whether an evidence gap is material; the comparator does not make that judgment. `evaluationStatus` and recorded missing rule results describe evaluation availability, not authenticated effect coverage.

## Limits and authorization

The JSON retains available policy, fixture, question, model, evidence-coverage and threshold identities, plus submitted current evidence and omissions. BLOCK remains BLOCK in reports even when the inspector shows Ran for actual execution. No archive is rewritten.

Scripted outputs, smaller requests and clearer UI labels cannot establish live semantic accuracy. Any live comparison needs separate owner authorization for both evidence disclosure and provider usage. Sanitize any supplied observations before using this workflow. Do not submit raw archives, credentials or owner source. `--live` and all unknown flags fail. No fixture action is executed by this command.

Thresholds, strict response validation, independent integrity, freshness, invocation-local approval, observe/enforce consequences and authenticated applicability gates remain unchanged. A retained tool description is ordinary evidence, not an executor guarantee. An ASK is not approval; an ALLOW or release is not proof of execution.
