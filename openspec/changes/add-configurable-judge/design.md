# Design

## Context

See [proposal.md](proposal.md) for motivation. The contracts are [judge configuration](specs/judge-configuration/spec.md) and [local judge assessment](specs/local-judge-assessment/spec.md).

Observed in this checkout:

- `src/runtime/resources.ts` lazily constructs `createJevJudge` and treats an injected judge, judge factory, or TypeSafe key as judge availability.
- `src/decision/jev.ts` fixes the TypeSafe destination, sends one `systemOne` request, builds every question, maps its answers, and validates the complete assessment.
- `src/runtime/config.ts` reads environment settings. `src/runtime/activation.ts` reads a separate private `~/.tenet/control.json` with a strict two-field schema.
- Current main selects only the project-local `TENET.md`; `TENET_POLICY` is ignored. Owner-wide judge settings do not restore policy overrides or introduce a global policy source.
- `src/decision/decide.ts` uses one deadline for an assessment, validates injected judges too, and currently records `requestedModel` as `jev-latest` even for other judges.
- `src/decision/questions.ts` emits three answers for each user rule and two for integrity. Without current authenticated references, a facts question has only the candidate `NONE`.
- Observe mode already releases calls before network assessment. Its queue defaults are two running jobs, 32 waiting, 1 MiB retained snapshots, and 5000 ms queue age. The queue is per guard, not a Pika-wide admission limit.
- `src/doctor/doctor.ts` is offline but assumes all judges require a TypeSafe key. Pi's startup disclosure names TypeSafe unconditionally.
- Tests cover Jev transport, complete response validation, background queues, doctor, SDK lifecycle, and archive capture. Existing recording request records expect a canonical model/state/questions envelope.

The approved Pika trial installed APUS OpenJev v1 4B Q8_0 with llama.cpp b11118. One cold, 318-token question took 4.992 seconds and correctly selected PASS; loading took 1.266 seconds separately. This is not a full Tenet assessment, a calibration result, or a direct Clef comparison. The trial server and monitor are stopped. No persistent server or tunnel exists.

## Goals / Non-Goals

**Goals:**

- Keep settings, provider construction, and provider-specific readiness behind a shared small interface used by Pi, SDK, and doctor.
- Reuse one question builder, evidence snapshot, assessment validator, and decision engine.
- Keep provider identity and native rendering separate from the recorded semantic assessment contract.
- Support the installed APUS model without Python or a local model dependency in the Tenet package.

**Non-Goals:**

- A provider registry, arbitrary chat-model compatibility, automatic installation, managed SSH, public endpoints, or hot reload.
- Prompt simplification, lower thresholds, changed authenticated-fact rules, global cross-process queue coordination, or proof that transport abort stops remote inference.
- Automatic edits to owner settings, live evaluation, or enforcement activation during implementation acceptance.

## Decisions

### 1. One private owner settings file

Add a bounded settings reader under `src/runtime/` for `~/.tenet/config.json`. Resolve the owner home without using the project working directory. Permit an internal read/home seam for isolated tests; do not add project search or an automatic project override.

Use version 1 with these fields:

- Required `version: 1` and `judge.provider`.
- `judge.provider: "typesafe"` accepts no destination or credential fields; it retains the official URL and `jev-latest`.
- `judge.provider: "apus-llamacpp"` requires `baseUrl` and `model`. The model value is the expected server alias, not a model download instruction.
- Optional `decision.deadlineMs` and `observation.running`, `waiting`, `bytes`, and `ageMs`.
- Reject unknown fields, wrong types, credentials, executable paths, module names, mode, thresholds, policy selection, and recording controls in this file.

Read at most 32768 bytes from a private regular single-link same-owner file in a private same-owner settings directory. Use no-follow/nonblocking descriptor reads and identity checks comparable to the existing activation reader, including unsafe ancestors. Missing is distinct from unreadable, malformed, or unsafe. Do not create, chmod, migrate, or repair files while reading. Share a small safe-read helper only where the existing control implementation truly has the same checks; do not combine the two schemas or watchers.

Each guard owns a frozen startup snapshot, including a bounded invalid-settings result. Invalid settings make eligible sessions unavailable without throwing an unhandled construction error. New sessions in that guard do not reread the file. New guard instances can read new settings; Pi owners use a full process restart, not `/reload`, after an edit. Module import must still have no file or network side effects.

Rejected alternatives: project settings let repository content redirect disclosure; adding keys to `control.json` breaks its strict activation schema; watching settings permits mixed-model work and complicates cancellation ownership.

### 2. Explicit precedence with unchanged existing controls

Select an explicitly injected SDK `judge` or `createJudge` before the JSON network provider. Preserve their existing precedence and dependency ownership. JSON provider credentials are irrelevant to an injected judge, but common effective settings still require validation.

For the deadline use built-in defaults, then JSON, then `TENET_JUDGE_DEADLINE_MS`. Keep environment behavior for existing settings. For queue limits use current defaults, then JSON, then explicit `GuardOptions.observationLimits`. Validate the merged limits; use the new positive-integer and timer bounds for settings supplied through JSON, without silently coercing invalid values.

Leave `TENET_MODE`, policy selection, confidence thresholds, approval timeout, evidence bounds, and `TENET_RECORDING` on their current paths. Provider selection cannot switch activation or enforce mode. An absent JSON file changes no ordinary default.

Proposed experimental Pika settings, not a measured throughput guarantee:

```json
{
  "version": 1,
  "judge": {
    "provider": "apus-llamacpp",
    "baseUrl": "http://127.0.0.1:8088",
    "model": "apus-openjev-v1-4b-q8"
  },
  "decision": { "deadlineMs": 120000 },
  "observation": {
    "running": 1,
    "waiting": 8,
    "bytes": 1048576,
    "ageMs": 120000
  }
}
```

These explicit sample limits avoid applying the short hosted-provider deadline to the CPU model. Real full-payload measurements can require different values. They do not change the absent-file defaults or increase model throughput. Expired and excess observations remain visible drops.

Rejected alternatives: implicit model-based limits hide the effective budget; increasing unbounded queues only hides overload; making the file a replacement for every environment variable broadens the change without helping provider selection.

### 3. Reuse the existing judge seam

Introduce one closed provider factory for TypeSafe and APUS, not a plugin registry. Return the judge and a small provider descriptor containing provider identity, requested model, local configuration availability, and native rendering identity. Keep construction lazy and avoid any connectivity probe from doctor or module import.

Use the same local preparation result in runtime resources and doctor, replacing TypeSafe-key-only readiness. APUS configuration does not need that key. TypeSafe retains its existing missing-credentials path. Native failure does not trigger fallback or retries.

Pass requested provider/model metadata into `decide` and recordings instead of the hard-coded Jev identity. For injected judges, support an explicit identity alongside the dependency and otherwise report requested identity as unknown. The returned assessment still supplies its returned model. Do not infer physical model provenance from an alias.

Rejected alternatives: pointing the TypeSafe SDK at llama.cpp cannot reproduce `systemOne`; a second decision engine would duplicate validation and approval safety; a Python sidecar adds a runtime dependency and another owned process unnecessarily.

### 4. Port the pinned APUS renderer, not the trial question

Add a TypeScript native adapter under `src/decision/`. It consumes the current `buildQuestions`, `assessmentEntries`, and `judgeState` output. Keep the canonical frozen state/questions envelope as the common capture and validation input; do not replace it with the trial's shorter hand-written policy-read prompt.

Port the standard-library renderer from APUS GGUF revision `7389d774472c9e29ddc84fffb392951f0f25de74`, whose prompt version is `jev.dynamic.prompt.v2`. Preserve its sorted-key JSON, Unicode behavior, separators, criteria descriptions, A-through-P candidate order, shared-state prefix, and no-thinking Qwen chat wrapper. Include its license attribution and a native rendering version in Tenet. Add golden request fixtures checked against that pinned contract. Do not download or execute upstream Python from the product.

For every multi-candidate question, submit one non-streaming `/completion` request with one predicted token, 1024 top log probabilities, temperature zero, caching enabled, and pre-sampling log probabilities. Set `post_sampling_probs: false` explicitly so sampler output cannot replace the logits distribution. Require exactly one scored token position and every expected candidate label. Reject duplicate candidate entries and nonfinite log probabilities; normalize stably with max-subtraction, map back to original labels, select the highest-probability candidate, and run shared validation.

APUS's renderer requires two through sixteen candidates. Only the current facts question can have the sole allowed answer NONE. Produce that known selector without inference, with probability one over its one allowed candidate and explicit deterministic provenance. It is not model confidence, evidence sufficiency, or authenticated coverage. Do not add a fake candidate or synthesize an outcome/evidence score. Continue to validate unsupported NOT_APPLICABLE through the current authenticated-fact checks.

Extract common answer assembly/validation from `jev.ts` if needed, preserving TypeSafe's existing SDK request and zero-retry behavior. There must be one canonical assessment mapping, not independent rule parsers.

Rejected alternatives: generic chat JSON loses candidate scores; forced-choice grammar or candidate masking can hide missing probabilities; shortening semantic instructions for speed is a separate semantic change and is not authorized here.

### 5. Bound local transport and verify its model/context

Allow HTTP only to parsed literal loopback IPv4 or IPv6 with an explicit valid port, no URL credentials, and no non-root path, query, or fragment. Reject redirects and never forward the TypeSafe key. Bound response sizes before JSON parsing and use safe failure categories rather than provider error bodies.

At assessment time, read backend model metadata under the same cancellation/deadline budget. The configured alias must match the backend-reported loaded model. Confirm identity again before accepting the complete assessment, and reject conflicting response identities when present. Record the identity the backend reports, not a guessed model name or proof of weights. Use the pinned llama.cpp `/v1/models` and `/props` metadata contracts in offline fixtures.

Check the native prompt's token count against the reported context capacity using the same backend tokenizer and special-token behavior. Reject overflow before scoring where possible, and reject any completion response marked truncated. Do not trim evidence or allow context shifting to make a too-large assessment appear valid. Metadata/tokenizer requests are provider requests too and must be absent from doctor, off, dormant, and cancelled work.

Submit scoring questions sequentially within an assessment, checking abort/deadline before each transport. Cache reuse is optional acceleration, never permission to change the prompt or use another invocation's state. Record native timing/cache counters when available without treating them as coverage evidence. Shared-prefix token boundaries must match full-prompt tokenization; recurrent-model prefix caching must not be assumed to work.

Do not allocate a new full timeout for each question. A partial result, invalid response, timeout, or cancellation cannot yield a complete assessment. Transport cancellation cannot prove that the backend stopped computing; the runtime's existing lifecycle checks remain authoritative for accepting results.

Rejected alternatives: concurrent scoring on the single-slot CPU server increases contention and harms cache locality; DNS/LAN/public destinations add disclosure and authentication scope; continuing after one malformed question could fabricate a complete assessment.

### 6. Readiness and recording remain honest

Update SDK readiness, offline doctor, Pi startup/status disclosure, and owner summaries from the selected provider descriptor. Show APUS as experimental, distinguish settings validity from connectivity, and show effective deadline/queue settings. Doctor must not instantiate a provider client, perform HTTP, start a model/tunnel, or create files.

Keep the current semantic assessment profile and question version because instructions and criteria are unchanged. Record the APUS rendering version separately. If implementation changes those semantics, stop and revise the plan rather than silently reusing the old question version.

Preserve existing canonical request archive fields and add provider, model selection, rendering identity, per-question transport mapping, and deterministic-answer provenance. Capture enough bounded rendering inputs to reconstruct what was submitted without a new always-on raw log. Native responses use the existing bounded untrusted snapshot path. Owner transcript reports contain validated findings, not native prompts, raw responses, credentials, or error bodies.

New schema changes, if required by the actual record contract, get an explicit version and reader support. Do not rewrite old records, reinterpret historical scores using the selected provider, or claim that a configured alias proves the loaded weight revision. Keep requested identity available for timeout/failure records without fabricating a returned model.

### 7. Keep runtime setup owner-operated

Document the installed Pika model and native CPU binary as an experimental prerequisite, not a new Tenet installer. The owner starts a persistent server on Pika's loopback with a matching alias, one slot, CPU offload disabled, adequate context, and server access logs disabled. The owner then opens loopback SSH forwarding on the Tenet machine and writes private settings outside the guarded agent's action path.

The guide must disclose that full policy and selected evidence reach Pika and may contain secrets despite redaction. `TENET_RECORDING=off` disables the normal local archive, not that disclosure or backend logging. Confirm that server access logging is disabled; do not claim that removes every operational log. Backend log access/retention remains an owner responsibility.

Full live Tenet-payload evaluation is a separate explicitly authorized check after offline validation. Do not start a server, open a tunnel, edit `~/.tenet/config.json`, replace an installed extension, or enable enforcement as a side effect of implementing or testing this change. Ship no weights, Python packages, private recordings, or machine-specific scripts in Tenet's archive.

## Risks / Trade-offs

- Full requests can exceed the two-minute example deadline. Keep the deadline explicit and measure the complete contract before recommending values; the five-second trial is insufficient evidence.
- One CPU server cannot assess every action from many active processes. Keep bounded queues and loss status; per-guard running limits do not coordinate all processes sharing Pika.
- The native renderer or tokenizer can drift. Pin a rendering contract and supported server protocol, add golden fixtures, and reject unsupported responses instead of guessing.
- A very unlikely candidate can fall outside the returned top 1024 tokens. Reject an incomplete distribution, never fill it with zeros or infer certainty from the selected label.
- Native client disconnect can leave backend work active. Bound client acceptance and make this limit explicit; do not report remote resource reclamation as verified.
- Owner files and loopback listeners are cooperative same-user controls. Private permissions and SSH reduce accidental disclosure but are not an OS sandbox or physical-model attestation.
- Longer background queues retain more sensitive snapshots. Preserve byte limits, capture opt-out, lifecycle cancellation, and explicit drop counts.

## Migration Plan

1. Add offline settings, provider-selection, rendering, response, cancellation, queue, readiness, and identity tests before changing default wiring.
2. Implement shared preparation and the APUS adapter without changing absent-file TypeSafe behavior or semantic questions.
3. Integrate SDK/Pi/doctor/recording and update maintained experimental setup/disclosure docs. Validate the relocatable delivery without copying Pika files.
4. Run the affected offline checks and the complete applicable `CONTRIBUTING.md` and delivery verification sequence. Run one read-only completion review and resolve blockers.
5. Present the built change and its limits. Ask separately before installing it or configuring the owner's persistent server, tunnel, and JSON settings.
6. After separate authorization, evaluate representative full payloads in observe mode, including harmless reads, literal fixture content, actual commit text, publication approval, opaque scripts, and authenticated reference cases. Do not execute fixture actions or claim calibration from this set.
7. Roll back provider selection by restoring explicit TypeSafe settings or removing the optional settings file outside the guarded action path, then restart Pi. A usable TypeSafe credential remains required. Stop owner-operated forwarding/server processes separately; preserve historical records.
