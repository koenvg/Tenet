# Proposal

## Why

Tenet's default judge is fixed to TypeSafe, so an owner cannot select a self-hosted evaluator without SDK code. Add owner-wide JSON settings and an APUS adapter so Koen can use the installed model on Pika while keeping Tenet's decision checks unchanged.

## What Changes

- Read versioned settings from `~/.tenet/config.json` for every project belonging to the owner on that machine. Do not search project directories or extend the separate on/off `control.json` file.
- Select the existing TypeSafe judge or an experimental `apus-llamacpp` judge. An absent settings file retains the TypeSafe default. Invalid settings or an unavailable selected provider do not cause automatic fallback.
- Configure the whole-assessment deadline and bounded observation queue through JSON. Keep current environment overrides, explicit SDK dependencies, policy selection, mode, thresholds, and capture controls.
- Translate Tenet's complete current questions into APUS's pinned choice-scoring contract. Require outcome, evidence, fact-reference, and independent integrity answers before returning a validated assessment.
- Report the selected provider and requested/returned model identities in readiness, owner reports, and recordings without leaking credentials or relabelling old records.
- Keep doctor offline and make credential requirements provider-specific. APUS does not require a TypeSafe key.
- Document a persistent loopback-only Pika server and a private SSH tunnel as owner-operated setup. Start rollout in observe mode; background findings may arrive late or be dropped under load.

The change does not start services, edit the owner's settings, enable enforcement, change policy semantics, shorten evidence for speed, or claim calibrated model accuracy. No public model endpoint, model installer, automatic tunnel management, or general chat-model integration is included.

## Capabilities

### New Capabilities

- `judge-configuration`: Owner-wide provider selection, settings validation and precedence, deadline/queue configuration, offline readiness, and restart behavior.
- `local-judge-assessment`: Complete APUS choice-scoring assessments with cancellation, model identity, recording, existing safety validation, and private owner-operated connectivity.

### Modified Capabilities

None. Existing `configurable-policy-enforcement`, `global-tenet-control`, and `session-policy-activation` behavior remains in force. Provider-specific credential requirements extend readiness without changing policy eligibility or permission gates.

## Impact

- Shared configuration and provider construction in `src/runtime/config.ts` and `src/runtime/resources.ts`; a new bounded owner-settings reader and APUS judge implementation.
- `src/decision/questions.ts`, `jev.ts`, and `decide.ts` integration seams; retain one question definition and one assessment validator rather than separate decision engines.
- SDK/Pi readiness, `src/doctor/doctor.ts`, model identity in `src/recording/`, owner reporting, and affected delivery checks.
- Offline configuration, provider parity, transport, cancellation, queue, doctor, recording, and packaged-consumer tests. No live provider request belongs in ordinary validation.
- Maintained setup and assessment documentation. Existing Pika installation, trial scripts, and cleanup tasks `TENET-64` and `TENET-65` remain separate.
- New settings and APUS support are additive. No settings file preserves existing defaults. Arbitrary injected SDK judges remain supported, with unknown requested identity reported honestly.
