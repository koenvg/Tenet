## Context

See proposal.md for motivation. `Rule` currently contains identity, line, text and severity. `loadPolicy` recognizes an optional BLOCK/WARN prefix and treats the remainder as text. IDs bind the complete policy digest to a line, so an external map keyed by current IDs would break whenever any policy bytes change.

`blockingDiagnostics` applies one global evidence threshold. `ruleContributions` also writes that global value for every rule, even passing ones. The inspector prefers recorded contributions over diagnostics, then falls back to global configuration. Updating diagnostics alone would therefore leave incorrect historical displays. Existing diagnostics tests already cover exact global boundaries and independent gates.

The main configurable-policy-enforcement spec preserves global defaults and generic evaluation. Older pending changes describe a narrower parser grammar. This change adds a reserved metadata slot without rewriting those unrelated planning artifacts. Their parser wording needs reconciliation when those changes are archived.

## Goals / Non-Goals

**Goals:** Keep threshold selection deterministic, rule-local and independent of evaluator semantics. Preserve one effective value across enforcement and historical reporting.

**Non-Goals:** Per-rule outcome thresholds, stable user-defined IDs, external override maps, domain matching, automatic threshold tuning, prompt changes, new dependencies or live semantic validation.

## Decisions

### 1. Keep the override beside the rule

Use `Rule; BLOCK; evidenceThreshold=0.8; <text>` or the equivalent WARN declaration. Require explicit severity for new metadata so legacy `Rule; text` remains untouched. Store an optional readonly numeric `evidenceThreshold` on parsed rules. Preserve snapshot hashing over original bytes and current freshness checks.

Use a bounded reserved slot, not a general options language. After severity, recognize the exact case-sensitive leading token `evidenceThreshold`; require an equals sign, unsigned decimal value and terminating semicolon. Trim whitespace around the key/value. Check the numeric result is finite and in [0, 1]. Reject a consecutive duplicate setting and an empty text remainder. Once ordinary text starts, preserve its semicolons verbatim. Keep existing rule-byte limits applied to semantic text and the existing whole-file limit applied to metadata too.

This deliberately reserves a previously literal prefix in explicit-severity declarations. Document that narrow compatibility change. Lowercase or differently cased keys remain literal text, consistent with case-sensitive severity parsing. Accepting threshold metadata without severity would create a larger legacy-text collision; an external ID map would be brittle because IDs are snapshot-scoped.

### 2. Resolve thresholds once through a shared decision-layer rule

Resolve `rule.evidenceThreshold ?? config.evidenceThreshold`, never with a truthiness check because zero is valid. Integrity has no editable user-rule override and uses the global value. Keep outcome threshold selection unchanged.

Use one small pure resolver shared by diagnostics and contribution recording, rather than copying fallback logic across consumers. Validate programmatically supplied overrides at the decision boundary as well as during file parsing; invalid injected policy values return the existing configuration failure before calling the judge. Keep raw global configuration available as the fallback, not relabeled as each rule's effective setting.

Retain all label gates and severity/mode aggregation. A relaxed evidence-confidence gate does not turn FAIL into PASS or APPROVAL_REQUIRED into ALLOW. Shared question strings and question version remain unchanged. Explicitly project semantic text into evaluator state so policy metadata is not added to judge instructions or semantic rule fields.

### 3. Record effective values for passing and blocking rules

Update `ruleContributions` to use the same resolver as diagnostics for every assessed rule. Blocking reports already carry an evidenceThreshold field and should receive the resolved value. Preserve per-rule values in offline replay output as well; the aggregate config remains the global fallback and is not enough by itself.

Retain the inspector's recorded contribution, diagnostic, global-config precedence. Do not consult today's policy to render an old invocation. Add compatibility tests for older records with only global thresholds and incomplete records without thresholds. No archive version bump is needed merely to give existing numeric fields their correct effective values; any newly exposed replay field should be additive.

### 4. Apply the initial setting through configuration only

During implementation, change the bundled email declaration to:

```text
Rule; BLOCK; evidenceThreshold=0.8; Never send any email without confirmation.
```

Leave the publication and commit declarations without overrides. Their effective evidence threshold and integrity's remain 0.90 under default environment configuration. A non-default global setting still changes inherited thresholds, as it does today. Tests must also use unrelated rule domains and WARN rules to prove this is not an email special case.

## Risks / Trade-offs

- Lower thresholds can allow more uncertain assessments. Keep this an explicit owner choice, preserve independent gates and avoid claims of calibrated safety.
- Metadata-looking legacy prose can collide with the new reserved slot. Document the slot and retain legacy no-severity interpretation and all ordinary-text semicolons.
- Recording can disagree with enforcement if resolution is duplicated. Share resolution and assert identical diagnostic/contribution values, including no-diagnostic passing cases.
- Existing pending specs can restore obsolete parser wording during a later archive. Flag the overlap in this change and reconcile at archive time, not by silently editing another change now.
- Old binaries treat metadata as prose rather than applying the setting. Remove metadata before rollback; do not claim backward semantic support.

## Migration Plan

1. Implement parser and decision tests, then the shared resolution and reporting changes. Keep ordinary verification offline.
2. Update README with syntax, validation, fallback, mode behavior and rollback guidance. Change only the bundled email declaration during apply, not during this planning workflow.
3. Restart Pi for code changes. For deployed active policies, owners edit outside the intercepted path and reload the policy snapshot; keep runtime integrity protection unchanged.
4. Verify parser, decision, Pi integration, recording, inspector and replay behavior, followed by the repository test, smoke and typecheck commands.
5. To roll back, remove threshold metadata from deployed policies before restoring the old implementation. All rules then use the global fallback; preserve archived effective values as historical data.
