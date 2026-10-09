# Proposal

## Why

Tenet owners need to select a compatible judge by protocol, endpoint and model without adding a vendor option for each model. This lets Tenet on a Mac address a local evaluator on Pika through private forwarding while the owner works on UI flow without Jev credits.

This is a planning-only change for reviewers of this developer checkout. It does not establish Kev accuracy or authorize setup on either host.

## What Changes

- Add one configurable System One adapter for the existing Jev request/response contract and compatible Kev servers. Reuse `Judge`, shared question preparation, answer assembly and enforcement checks.
- Keep APUS native llama.cpp as a distinct implementation with its current model-specific renderer, scoring and transport contracts.
- **BREAKING**: replace version 1 vendor selection with one version 2 schema for owner settings and project overrides. Require an explicit protocol, base URL and requested model; System One also requires an explicit anonymous or environment-backed bearer credential choice. Reject old live settings without automatic migration or fallback. Confirmed absence of both settings files retains official TypeSafe/Jev behavior through the same System One adapter.
- Let `<project>/.tenet/config.json` override every supported JSON setting in `~/.tenet/config.json`, including endpoint and credential source. Replace `judge` as a complete object; overlay supplied deadline/observation fields. Keep existing environment/SDK precedence. Reject invalid project settings without owner fallback, and isolate immutable settings per project.
- Require HTTPS for hosted endpoints. Permit HTTP only at exact literal loopback addresses with an explicit port. Reject redirects. Never implicitly send TypeSafe credentials to a custom endpoint.
- Record and disclose the requested destination, protocol and model separately from the returned model and assessment contract. Keep historical identities unchanged and doctor offline.
- Keep deadlines, thresholds, authenticated facts, policy integrity, cancellation and exact-call native approval independent of model selection. Add no retries, fallback or mock mode.
- Verify the wire contract offline, including rejected four-decimal probability sums. Do not repair probabilities, change tolerance or calibration, tune prompts, or claim that Kev is a usable production judge.

## Capabilities

### New Capabilities

- `system-one-judge`: Explicit compatible endpoint selection, credential isolation, bounded System One transport, unchanged enforcement and version-aware destination/identity reporting.

### Modified Capabilities

- `judge-configuration`: replace owner-only selection with private project overrides for every JSON setting, version 2 protocol selection, per-project snapshots and selected-source diagnostics. `configurable-policy-enforcement` remains unchanged.

The `add-configurable-judge` baseline is now synced to main specs and archived at `../archive/2026-10-09-add-configurable-judge/`. Its owner-only/version 1 contract remains the current implemented baseline, not the proposed behavior. [Design reconciliation](design.md#existing-work-and-specification-reconciliation) identifies the full MODIFIED delta still needed before apply. That delta file does not exist yet; creating it is a separate planning step, not part of this existing-artifact revision. Main and archived specs remain unchanged.

## Impact

Affected implementation areas are `src/runtime/settings.ts`, configuration/judge preparation, `src/decision/jev.ts`, SDK status types, doctor, Pi disclosures, recording identity readers and existing inspector/BB presentation. The proposal adds identity fields to existing views, not a UI flow implementation.

Offline coverage extends owner-settings, Jev transport, judge identity, doctor, APUS, runtime/approval and historical recording tests. Production delivery must include the replacement adapter. The existing SDK dependency remains for question construction; no plugin framework or new provider dependency is planned.

Documentation will update `docs/judge.md`, configuration/disclosure references and archive/SDK/doctor guidance. TENET-117 already records the current configuration-guide defect; reuse it rather than create another cleanup ticket. No task status changes are authorized here.

Source request: [source conversation](bbthread://thr_33hqeap49z). `coding-agent-first-sdk` status and host obligations remain intact. `simplify-default-judge-prompts`, TENET-104 and its children keep ownership of scoped prompts and submitted-input versions.

## Non-goals

No implementation, apply, source/test/dependency edits, commits, publication, model download or installation, SSH changes, service starts, owner settings edits, UI deployment, inspector remote exposure, live model calls, tuning or performance work. No workers or additional BB threads. Existing injected offline fixtures remain a separate way to develop UI flow.
