# Design

## Context

Reviewers can use this checkout-only design to assess the proposed owner settings and transport contract for Tenet on a Mac and a private evaluator on Pika. Nothing on either host is configured by this document. See [proposal](proposal.md) and [behavior contract](specs/system-one-judge/spec.md).

Inspection baseline is commit `21a0a9f7821bd2b0be3b534f8dc5c9a7307e5ea5`, later than the supplied `2f39ff5f6da819e4d640c5ab77dfa5f2671afb7b`. The relevant observations still hold:

- `src/decision/contracts.ts` already supplies the small `Judge` interface. `src/decision/jev.ts` uses the SDK with a fixed official origin, `jev-latest`, disabled logging and zero retries. `test/jev.test.ts` verifies `/v1/systemone`, the model/state/questions envelope, complete answers and cancellation.
- `src/runtime/settings.ts` accepts version 1 TypeSafe or APUS settings. It validates raw loopback URL syntax and reads private owner files with descriptor/identity checks. `configuration.ts` snapshots effective settings; environment deadlines still override JSON. `judge.ts` prepares locally and constructs the selected adapter lazily.
- `assessment-answers.ts`, `response-validation.ts`, `assessment-shape.ts` and `decide.ts` assemble and validate all providers. Unit-sum tolerance is `0.000001`. The current profile is `applicability-v1`; question version is `policy-rules-v8-source-set`.
- APUS has separate native transport, model/context checks, renderer and recording contracts. Its current limits are 8 MiB request and 1 MiB response. This is not Kev's `/v1/systemone` protocol.
- `RequestedJudgeIdentity` and `recordedJudgeReport` enumerate providers. `judge-report-v1` records identity without a destination. Archive schemas 1 through 5 remain readable. `recording/native.ts` reads historical APUS contracts without current settings.
- SDK reports, runtime/consequence records, Pi guard/owner reports and doctor carry these identities. Doctor currently checks TypeSafe credential presence unconditionally. Inspector `view.ts` and `RecordingDetails.tsx` show recorded provider/model; BB summaries use the shared summary path and do not have a separate vendor factory.
- `src/claude/cli.ts` and current replay utilities in `eval/semantic-cli.ts`, `eval/local-work-replay.ts` and `eval/commit-replay.ts` also construct the fixed Jev adapter. Their current explicit official destination and live opt-in boundaries must survive the adapter replacement. `eval/recorded-decision.ts` separately submits version-routed historical payloads; it must not regenerate them from current questions.
- Owner-settings, judge-identity, APUS-runtime/recording, doctor and Jev tests already provide isolated homes, scripted transports and no-live readiness checks. No live mock fallback is needed.

The supplied native-precision Kev experiment is context, not a protocol acceptance test. Compact rendering improved raw user-rule labels from 2/10 to 6/10 on ten paired cases. All eighteen compact cases still projected BLOCK, including seven harmless actions. The first process was manually killed and remaining tests explicitly restarted; this is not evidence of OOM or model failure. The private trial file, credentials, owner policy, recordings and weights were not needed for this design.

## Goals / Non-Goals

Goals are one System One implementation with explicit disclosure/authentication and one unchanged APUS native implementation. Keep protocol transport below common assessment and permission boundaries.

Do not generalize beyond those two implementations. No registry, arbitrary JSON mapper, endpoint discovery, OpenAI/chat adapter, score calibration or prompt work. Model installation, forwarding, UI flow and tuning remain separate work with separate authorization.

## Decisions

### One explicit version 2 schema

Replace the live version 1 schema rather than mutate its meaning. Alpha permits this breaking change; a version bump makes manual owner action and diagnostics clear. Use the existing field name `baseUrl` for an origin, not a full request URL. `/v1/systemone` is fixed by the protocol.

Both file roots allow only `version`, `judge`, `decision` and `observation`. Owner settings require `version: 2` and `judge`; project overrides require `version: 2` and can omit any override object. Preserve existing deadline/queue fields and bounds. The closed judge union is:

| Protocol | Required fields besides `protocol` | Constraints |
| --- | --- | --- |
| `system-one` | `baseUrl`, `model`, `auth` | HTTPS hosted or literal loopback; explicit credential mode |
| `apus-llamacpp` | `baseUrl`, `model` | Existing HTTP loopback validation; no auth fields |

`protocol: "apus-llamacpp"` names the supported native implementation, not a generic llama.cpp adapter or System One compatibility claim. Do not change its renderer or score derivation.

`model` retains the existing nonempty alias check, maximum 256 characters and no C0/C1 controls. Reject extra fields at every level. The current private-file reader, 32768-byte bound, invalid/absent distinction stay intact for each file. The owner snapshot is frozen at guard construction; effective project snapshots are frozen at first project initialization. Version 1 is unavailable with configuration diagnostics, never an implicit TypeSafe switch.

These are proposed offline schema examples for reviewers. They are not accepted by current Tenet and are not instructions to write the owner's file.

Anonymous Mac loopback for a separately authorized Pika forward:

```json
{
  "version": 2,
  "judge": {
    "protocol": "system-one",
    "baseUrl": "http://127.0.0.1:18091",
    "model": "kev-latest",
    "auth": { "type": "none" }
  }
}
```

Explicit official hosted selection, with the secret supplied outside JSON:

```json
{
  "version": 2,
  "judge": {
    "protocol": "system-one",
    "baseUrl": "https://api.typesafe.ai",
    "model": "jev-latest",
    "auth": { "type": "bearer-env", "name": "TYPESAFE_API_KEY" }
  }
}
```

APUS version 2 keeps its own implementation:

```json
{
  "version": 2,
  "judge": {
    "protocol": "apus-llamacpp",
    "baseUrl": "http://127.0.0.1:8088",
    "model": "apus-openjev-v1-4b-q8"
  }
}
```

Confirmed absence of the owner file supplies an internal base System One selection for the official origin, Jev model and TypeSafe environment source. It does not create JSON. Invalid files never enter this default path. No model-specific timeout exists. Injection precedence and common configuration failure remain unchanged.

Rejected alternative: version 1 with extra optional endpoint fields hides a breaking change and creates ambiguous credential defaults. A `kev` provider would repeat the problem for the next compatible model.

### Project settings override every JSON field

Read only `<project>/.tenet/config.json` for project overrides. Use the canonical directory supplied by the host as the session working directory, or `doctor --project`; do not infer it from policy paths, search parents or use a generic project `config.json`. This gives each project a known, Tenet-specific location.

Every JSON-controlled setting can be overridden. If a project supplies `judge`, require the complete supported judge object and replace the owner judge as one unit, including protocol, destination, model and auth. Never inherit a credential source while replacing an endpoint. If the project omits `judge`, inherit the entire owner/default judge.

Overlay supplied `decision.deadlineMs` and each supplied `observation` field onto owner values. Omitted fields inherit owner values, then built-in defaults; null, wrong types and unknown fields are errors, not deletion syntax. Version is a schema marker and both files must use version 2. No new mode, policy, threshold, approval, evidence or recording setting enters JSON.

```text
built-in defaults -> owner JSON -> project JSON -> existing env/SDK overrides
```

The environment deadline remains above both JSON sources. Explicit SDK judge injection remains above configured judge selection, and explicit SDK observation limits remain above both files. Validate both source files and the effective settings; an invalid owner file is not excused by a project override. An unsafe, unreadable, oversized, malformed or unsupported project file makes that project's configuration unavailable, never an owner-provider fallback. Confirmed project-file absence is the ordinary inheritance path, not recovery from an error.

Require the existing same-owner/private regular-file and `.tenet` directory checks for project configuration too, including no-follow descriptor reads, single-link files, safe ancestors, identity races, valid UTF-8 and the 32768-byte bound per file. Do not create, chmod or repair either source. Owner-managed permissions reduce accidental changes but do not prevent a same-user agent from writing; they are not a sandbox. Review project endpoint and credential selection before using it, especially in a cloned checkout.

The startup environment and owner settings are frozen once per guard. At first initialization of each canonical project, read and freeze its project overrides, merge effective settings and resolve only the final selected credential from the frozen environment. Cache valid and invalid snapshots for that project's lifetime in the guard. Later sessions in the same project reuse its snapshot; another project gets its own selection. Edits require a new guard or full Pi process restart, not `/reload` or a new session. Do not hot-reload or retry a failed settings read.

`createRuntimeResources` currently owns one guard-wide prepared judge and observation queue. Reuse its runtime implementation behind per-project resources so projects with different judges, deadlines and queue limits cannot affect one another. Keep shared owner control, archive ownership and explicit SDK judge/factory ownership at the outer guard; project resources must not construct an injected factory repeatedly. Closing a session cancels its own work; closing the guard disposes every project resource. No project credential closure is reused for another project.

Session readiness, owner reports and records carry that session's effective judge and settings source. Replace the ambiguous single guard-level judge/configuration status with `GuardStatus.projects`, a list of canonical project directories and their judge/configuration/observation health. Before any project opens, the list is empty, not a claimed global effective judge. Doctor resolves the requested project offline. Pi status reports its current session's effective selection.

Record source provenance as `owner`, `project` or `default` for JSON-selected values, and `environment` or `sdk` when existing explicit overrides determine the effective value, without copying file contents or secret values. Keep historical displays on their recorded configuration and destination. A project-selected hosted endpoint can receive both policy/evidence and the explicitly selected bearer credential; the configuration is an owner disclosure choice, not native permission to publish or approve actions.

For the proposed private project file, this offline example changes only queue limits and inherits the complete judge and deadline from owner/default settings:

```json
{
  "version": 2,
  "observation": { "running": 1, "waiting": 8 }
}
```

The full local judge example above can instead be used as a project override; its explicit anonymous auth replaces hosted auth rather than inheriting it. No example here writes or activates a real settings file.

Rejected alternatives: ignoring project settings contradicts the requested precedence; merging individual judge fields can send an owner's credential to a different endpoint; parent search and generic `config.json` create unexpected sources; one guard-wide effective judge cannot represent multiple projects safely.

### Validate origin and credential routing before transport

Keep APUS raw HTTP-loopback matching as it is. For System One allow an optional trailing root slash, then retain a canonical origin for requests and disclosure. HTTP requires exact `127.0.0.1` or `[::1]` plus an explicit decimal port 1 through 65535. Do not accept `localhost`, alternate IP spellings or normalized loopback aliases.

HTTPS accepts an ASCII DNS host, canonical IP literal or bracketed IPv6 literal, with an optional valid explicit port. Reject raw whitespace, controls, backslashes, percent-encoded authority, user information, empty query/fragment delimiters and any non-root path before parsing. Reject URL normalization that changes the raw host into another host representation; ordinary DNS case folding and default-port/trailing-slash canonicalization are allowed. Bound the base URL to 2048 characters. No base path or `/v1` configuration is needed by current endpoints.

`auth` has exactly `type: "none"`, or `type: "bearer-env"` plus `name` matching `[A-Za-z_][A-Za-z0-9_]{0,127}`. Anonymous use requires a literal loopback origin. Hosted use requires a bearer source. Loopback can also explicitly use bearer authentication. This is a bounded supported authentication mechanism, not a secret-store abstraction.

Read only the chosen source from the supplied startup environment, copy it into the adapter closure, and never expose the value through a status object or request capture. Require a nonblank header-safe ASCII value without whitespace/control characters. Missing or invalid values produce local `missing-credentials` availability. Credential presence does not verify validity. Environment source names are configuration references, not secret values; reports need only the mode, not the variable name.

Custom settings never inherit `TYPESAFE_API_KEY`, even if another environment value exists. Explicitly naming it is an owner choice, not automatic reuse. Anonymous/APUS requests omit Authorization. Fetch omits ambient cookies/credentials and rejects all redirects with no second destination request. No automatic retry, fallback, environment endpoint override or client logging is allowed.

The validated owner/project settings snapshot is the disclosure selection boundary, not publication permission. Endpoint selection cannot bypass native approval, authorize publication, disable TLS verification or establish sandboxing. The unauthenticated inspector remains loopback-only.

Rejected alternatives: SDK environment/default credential lookup can leak credentials to a custom origin; following same-origin redirects adds hidden destinations; allowing HTTP LAN/DNS destinations is unnecessary for the proposed private forward.

### Replace fixed Jev transport with one System One adapter

Create `src/decision/system-one.ts` and retire the fixed `createJevJudge` live implementation. Both the absent-file official default and explicit hosted/local selection call `createSystemOneJudge` through the existing lazy factory. Do not retain a compatibility switch or alternate Jev live adapter. The TypeSafe SDK remains for its existing `choice` question constructor; no new dependency is required.

Use direct fetch with explicit method, destination, headers, serialized payload and abort signal. This permits anonymous local operation and explicit redirect refusal without depending on SDK credential defaults. Reuse current `buildQuestions`, `judgeState`, mapping, capture and `assembleAssessment`; do not move gate logic into transport. Keep the SDK-tested wire envelope and canonical choice answer shape: returned `model`, `answers[questionKey]` with `type`, `choice`, `confidence` and `probabilities`.

Migrate direct and dynamic imports in the current replay utilities, Claude prototype and scripted test fixtures to the same adapter. Keep those utilities' explicit official Jev selection and disclosure opt-ins; owner or project JSON must not silently redirect an authorized historical/official replay. The Claude prototype remains unverified and gains no new host-coverage or configuration-support claim. Preserve the separate version-routed historical replay utility and its pinned submitted payloads; that is historical contract support, not a parallel legacy live guard.

```text
effective project snapshot -> lazy selected Judge -> System One POST or APUS native
                                               -> shared validated assessment
                                               -> shared gates and native approval
```

The first part chooses transport. The final part decides permission independently of model selection. Preserve immutable submitted-state capture, question versions, policy source identity and authenticated-fact binding.

Use the proven APUS bounded-read/deadline pattern for System One with an 8 MiB serialized request and 1 MiB response limit. A small shared JSON transport helper is acceptable only if it removes actual duplicate transport code; do not make APUS path/scoring logic generic. Response streaming is byte-bounded before fatal UTF-8 decoding and JSON parsing. Check abort/deadline during transport and body reads, including noncooperative readers. Clean up timers/listeners and discard late work.

Classify non-2xx/redirect/network failures as `provider-error`, oversized request as `provider-error`, malformed/oversized success bodies as `invalid-response`, and timeout/cancellation through existing categories. Capture no non-2xx body or thrown provider error object. Valid application responses use existing bounded untrusted capture, never HTTP headers, fetch objects or credential closures. Diagnostics retain fixed validation codes. Redact the resolved credential value from any bounded diagnostic/capture string if a malicious response echoes it; test synthetic echo sentinels without altering probabilities.

Returned model aliases can differ from the requested alias, as Jev already does. Record the complete validated returned identity; do not require alias equality or claim weight provenance. No metadata, tokenizer, model-list or calibration requests are added to System One. APUS keeps its existing native identity checks.

If scoped prompt work lands first, use its single current prepared-input/submission path and recorded versions. Do not restore shared-state requests or create a second prompt mode. Multiple scoped submissions, if required by that work, still use the same System One adapter and whole-assessment budget; no partial result can pass.

Rejected alternatives: retaining SDK and direct-fetch live paths duplicates behavior; generic mapping masks incompatibility; reusing APUS scoring for Kev changes the protocol and is out of scope.

### Report transport identity separately from semantic contracts

Keep the existing public `provider`/`requestedProvider` identity fields, adding `system-one` to the current implementation union alongside `apus-llamacpp`, `injected` and `unknown`. New official-default reports identify `system-one`, not a separate TypeSafe implementation. Historical `typesafe` stays a valid historical `judge-report-v1` value only.

Introduce `judge-report-v2` with existing requested/returned model fields plus `requestedDestination`, `transportContract` and `authentication`. Destination is the validated canonical origin or null for injected/unknown selection. Authentication is `none`, `bearer-env` or null. Transport identity is `system-one-v1`, the existing APUS `llamacpp-b11118-choice-v1`, or null for injection/unknown. APUS's separate `apus-recording-v1` contract remains unchanged.

Propagate that descriptor into SDK owner reports, begin/assessment-status/decision/permission records, runtime consequences, Pi startup/status and bounded owner reports. Retain it on unavailable work without fabricating a returned model. Invalid configuration exposes null destination rather than the rejected raw URL. Returned model appears only after complete common validation. Sanitization must cover the chosen credential, not just `TYPESAFE_API_KEY`.

Keep outer archive schema 5 because canonical request/state and stages are unchanged; version the new additive identity contract explicitly. Extend `recordedJudgeReport` with separate v1 and v2 validation. Readers derive historical display from recorded fields only. `recordedJudge` must distinguish known v2 reports without making APUS historical contracts current settings. Missing historical destinations remain not recorded.

Update doctor JSON to schema version 3 for selected authentication diagnostics rather than its unconditional TypeSafe presence check. Anonymous/APUS presence is `not-required`; bearer presence is `present` or `missing`, with validity/connectivity unverified. Doctor does not construct clients, perform HTTP, write files, start models or open tunnels. Existing inspector/BB views expose the additive recorded transport identity and destination only; no new UI flow is included.

Do not change `applicability-v1`, `policy-rules-v8-source-set`, question wording or archived semantic records for this transport-only change. If concurrent prompt work changes those versions, retain its current contracts and old reader branches rather than reuse old identities for new inputs.

Rejected alternative: extending `judge-report-v1` to redefine TypeSafe as any endpoint makes historical destination interpretation false. Bumping all archive stages is unnecessary for additive identity metadata.

### Offline compatibility is not calibration

Use scripted fetch responses and isolated temporary owner homes, not a model server or a signed-in browser. A Kev-shaped valid response establishes only the subset Tenet accepts. Official Kev rounds probabilities to four decimals; some distributions will fail Tenet's unchanged tolerance. Add an explicit five-label sum of `0.9999` and assert invalid-response/unit-sum without normalization. Include accepted exact sums and rejected missing/extra labels, nonfinite/range errors, non-max choices, unsupported applicability and integrity failures.

Parity checks feed identical valid assessments through hosted System One, loopback System One and APUS. Compare assessments, diagnostics, thresholds, approval behavior and unavailable behavior rather than claiming similar models have similar accuracy. Credential, redirect and cancellation fixtures must assert request counts and zero alternate destinations. Historical v1/schema 1-5 fixtures must render unchanged under new settings.

UI development can use the existing injected `Judge` seam separately. A live unavailable local endpoint remains unavailable, not an implicit fixture. Performance and live accuracy are not acceptance criteria.

### Existing work and specification reconciliation

The `add-configurable-judge` baseline has been synced to `openspec/specs/judge-configuration/spec.md` and `openspec/specs/local-judge-assessment/spec.md`, then archived at `openspec/changes/archive/2026-10-09-add-configurable-judge/`. Preserve that implemented baseline and its archive; this proposal does not make project overrides active.

Before apply, create a full MODIFIED delta in this change for these existing `judge-configuration` requirements:

1. `Owner-wide settings source`: permit only the canonical project's `.tenet/config.json` to override every JSON setting; keep no parent search and separate activation control. Replace the scenario that currently forbids project override with project precedence and isolation scenarios.
2. `Bounded private settings validation`: require version 2, the project partial-override schema and the same safety/size checks per file; invalid project sources do not fall back.
3. `Explicit provider selection`: replace vendor selection with System One/APUS implementations and atomic project judge replacement, including endpoint and auth source.
4. `Configuration precedence`: add project-over-owner precedence for all JSON fields, while retaining environment deadline, explicit judge injection and SDK observation-limit precedence.
5. `Stable settings for a running guard`: freeze owner/env once per guard and effective settings once per canonical project; prevent later sessions, file edits and another project from changing a snapshot.
6. `Provider-aware offline readiness`: disclose the effective project selection, source provenance, destination and selected-auth diagnostics without network access.

Copy the full main-spec requirement blocks and retain every unaffected scenario before modifying them. Keep APUS private local destination and whole-assessment bounds. `local-judge-assessment` remains the distinct APUS native contract.

The required `specs/judge-configuration/spec.md` delta is still missing. This existing-artifact update does not create new files; run `openspec instructions specs --change configurable-system-one-endpoints --json` in a separate planning step to create it. Do not start apply or claim the proposal is fully reconciled until that artifact exists and strict validation passes. Applying only `system-one-judge` would leave contradictory owner-only main requirements.

`coding-agent-first-sdk` still owns shipped SDK/doctor/host guarantees. `simplify-default-judge-prompts` and TENET-104 children still own prompt/input changes; no edits to their artifacts. TENET-117 is the confirmed existing documentation defect. Coordinate its current-guide correction without duplicating it or changing status here.

## Risks / Trade-offs

- Kev reply rounding can invalidate a complete response. Keep the diagnostic explicit and use injected fixtures for UI work; do not repair distributions.
- Direct fetch replaces SDK timeout/error behavior. Scripted contract tests must lock down cancellation, body bounds, auth and safe failures before switching wiring.
- Configured aliases and HTTPS do not prove accuracy or model weights. Report identity and availability separately from calibration.
- Local loopback can forward to Pika and still disclose full selected strings. Documentation names that host/data path and backend logging limits; loopback is not a sandbox.
- Version 2 is a deliberate manual owner migration. Invalid version 1 blocks enforce and permits observe without an assessment; it never chooses a replacement destination.
- Additive transport metadata requires all identity readers to understand v2. Historical read tests prevent recomputation from current settings.

## Migration Plan

1. Obtain proposal approval and resolve the explicit baseline spec reconciliation before apply acceptance. Recheck concurrent prompt changes at the implementation revision.
2. Implement/test the version 2 reader and System One adapter offline, replace fixed Jev wiring, then update identity readers and existing disclosures. Preserve all APUS and enforcement regressions.
3. Update maintained and shipped docs with proposed anonymous local versus authenticated hosted examples, manual migration and full-process restart requirements. Complete applicable isolated checks in [CONTRIBUTING.md](../../../CONTRIBUTING.md).
4. Present the built result without editing owner settings or starting services. Owner migration/install, model setup, forwarding and live synthetic verification each require a separate bounded request.
5. After such authorization, the owner can manually rewrite version 1 settings into the documented version 2 form and fully restart Tenet. Hosted assessments disclose policy, paths and selected evidence and may use quota; Pika assessments disclose those strings to Pika. Capture off does not disable provider disclosure or backend logs.
6. To roll back a build, restore its matching settings schema manually and restart. Do not assume a version 2 file works with old code. To select hosted Jev on the new build, use explicit version 2 official settings or confirmed file absence with its credential available. Never automate fallback or delete records.

## Open Questions

No deferred schema or transport decision remains. Whether a particular Kev server build produces complete replies within the strict score contract is unverified and belongs to separately authorized live compatibility work. This does not block offline implementation and does not justify changing gates.
