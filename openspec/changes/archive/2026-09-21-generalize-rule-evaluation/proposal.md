## Why

TENET's shared evaluator questions contain domain-specific interpretations and incident-driven exceptions. Owners should define restrictions through rules, while the evaluator independently assesses each rule against the attempted effects of any action, regardless of tool or mechanism.

## What Changes

- Replace shared domain-specific guidance with a concise, generic independent-rule assessment contract for both outcome and evidence questions.
- Keep complete-rule interpretation, whole-invocation attempted effects, untrusted-evidence handling, material uncertainty and invocation-local approval requirements.
- Keep built-in integrity as a separate assessment and preserve existing aggregation, advisory enforcement, confidence gates and approval handling.
- Move domain examples exclusively into evaluation fixtures, without introducing effect categories, tool allowlists or domain-selected prompts.
- Replace the existing requirement for explicit Git-specific evaluator guidance with a generic requirement. Preserve its behavioral regression cases as fixtures.
- Version the question contract and document the difference between offline contract checks and live semantic evaluation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `configurable-policy-enforcement`: Replace domain-specific question guidance with generic, independent per-rule evaluation and cross-domain validation requirements.

## Impact

Primary implementation targets are `src/decision/questions.ts`, question version metadata in `src/decision/decide.ts`, SDK contract tests and `eval/generic-rule-fixtures.ts`. The replay runner and existing aggregation/approval tests supply validation. No dependencies, policy-file edits, public response-shape changes or threshold changes are planned. Existing publication-focused pending changes must not reintroduce domain-specific shared instructions when archived; their domain scenarios remain valid test material. Model classifications may change despite unchanged enforcement code, so semantic equivalence is not assumed.
