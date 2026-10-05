# Tasks

## 1. Owner-wide settings

- [ ] 1.1 Add offline owner-settings fixtures with isolated home/read seams; verify tests cover absent files, both providers, wrong versions/types/keys, unsafe links/permissions, unreadable files, and the 32768-byte boundary without touching real owner files.
- [ ] 1.2 Implement the bounded private settings reader and version 1 schema; verify the fixtures pass and a project-local file cannot affect provider selection.
- [ ] 1.3 Merge JSON deadline and observation limits with existing environment and explicit SDK overrides; verify precedence, integer/timer bounds, and unchanged absent-file defaults with focused tests.
- [ ] 1.4 Freeze a settings snapshot per guard and preserve mode, policy, thresholds, activation, and capture paths; verify file edits do not affect an existing guard and a new guard observes new settings.
- [ ] 1.5 Add the settings reference to one maintained judge guide; verify the JSON examples match the reader, label the Pika values experimental, and complete the writing-guide checklist.

## 2. Native APUS assessment

- [ ] 2.1 Add offline golden renderer fixtures from the pinned APUS contract, including Unicode, sorted JSON, criteria order, and the chat wrapper; verify byte-equivalent output without runtime downloads or Python dependencies.
- [ ] 2.2 Implement the TypeScript APUS renderer over current canonical state and questions; verify all rule/outcome/evidence/facts/integrity mappings match `buildQuestions` and the current semantic question version is unchanged.
- [ ] 2.3 Add scripted native response tests and implement candidate log-probability mapping; verify complete finite distributions, stable normalization, duplicate/missing labels, wrong shapes, and single-token requirements.
- [ ] 2.4 Handle the sole NONE facts candidate deterministically with recorded provenance; verify no scoring request is made for it, multi-candidate facts still use inference, and unsupported NOT_APPLICABLE remains blocked by existing checks.
- [ ] 2.5 Add bounded metadata, tokenizer, and completion transport with loopback validation and redirect rejection; verify expected alias/context checks, oversized bodies, truncation rejection, wrong models, and no TypeSafe credential forwarding using fake fetch.
- [ ] 2.6 Share cancellation and the whole-assessment deadline across sequential native requests; verify abort before/between requests, stalled transport, late responses, partial failure, zero retries, and zero cross-provider fallback.
- [ ] 2.7 Document the pinned rendering/protocol contract, attribution, deterministic selector, and uncalibrated probabilities; verify source links and fixtures agree and no general chat-model support is claimed.

## 3. Shared runtime and provider identity

- [ ] 3.1 Add the closed provider factory and local readiness descriptor to shared runtime resources; verify TypeSafe keeps its fixed destination, APUS needs no TypeSafe key, injected judges retain precedence, and imports remain side-effect-free.
- [ ] 3.2 Reuse common answer assembly and complete-assessment validation for both adapters; verify Jev regressions and scripted provider parity produce identical decisions, diagnostics, integrity gates, and invocation-local approval behavior.
- [ ] 3.3 Pass selected provider/requested model metadata through `decide`, SDK status, and failure records; verify APUS is not labelled `jev-latest` and injected judges use explicit or unknown requested identity.
- [ ] 3.4 Integrate JSON queue limits into the existing background path; verify release-before-assessment, retained immutable snapshots, capacity/age drops, off/dormant bypass, lifecycle cancellation, and enforce-mode unavailability with existing background and SDK tests.
- [ ] 3.5 Update SDK judge/configuration documentation for the new identity and precedence contract; verify compiled type fixtures and the offline SDK example still pass and mode/coverage limits remain visible.

## 4. Doctor, Pi status, and archive capture

- [ ] 4.1 Make doctor reuse local provider/settings preparation without client construction; verify APUS readiness without a TypeSafe key, invalid configuration diagnostics, effective limits, and no network/writes/model launch in doctor tests.
- [ ] 4.2 Update Pi startup/status and owner summaries to name the selected provider and experimental APUS status; verify fake-Pi tests retain owner-only disclosure and do not send findings, provider errors, or prompts into agent history.
- [ ] 4.3 Preserve canonical request capture and add provider/model/rendering/transport mapping plus deterministic-answer provenance; verify archive validation and capture-disabled tests cover bounded native responses and credential omission.
- [ ] 4.4 Update recording readers only as needed for explicit new metadata or schema versions; verify historical fixture identities and recorded contracts remain unchanged in inspector/recording tests.
- [ ] 4.5 Update maintained assessment, privacy, and doctor references to distinguish local readiness, connectivity, execution, calibration, and backend disclosure; verify examples match tests and check all 18 writing-guide items.

## 5. Owner-operated Pika setup and delivery

- [ ] 5.1 Document the already installed model's persistent CPU server, matching alias, adequate context, loopback binding, and disabled access logging using the pinned b11118 flags; verify examples against its published protocol/help, without running them.
- [ ] 5.2 Document owner-operated SSH forwarding, private JSON creation, full restart, observe-first rollout, connectivity failures, and rollback; verify endpoint/alias/settings examples agree and place explicit live-data disclosure and separate authorization before live steps.
- [ ] 5.3 Include the maintained judge guide and any new runtime/attribution files in the existing production archive; verify relocated consumer and delivery metadata tests exclude model weights, Python packages, owner settings, recordings, and Pika-specific trial scripts.
- [ ] 5.4 Document a separately authorized full-payload observe evaluation using inert read, literal-fixture, commit, publication-approval, opaque-script, and authenticated-reference cases; verify expected labels and reporting denominators without executing fixtures or claiming live results.

## 6. Integration acceptance

- [ ] 6.1 Run the complete affected offline sequence from `CONTRIBUTING.md`, including SDK/inspector builds, serial isolated Bun suite, type checks, inspector/browser tests, BB plugin checks, and the SDK example; verify every required command exits zero with provider credentials unset and no live inference.
- [ ] 6.2 Run the separate production archive and raw metadata verification lane from `CONTRIBUTING.md`; verify relocated SDK/Pi/doctor/configuration behavior and report any unavailable checks without treating them as passed.
- [ ] 6.3 Run one fresh read-only completion review against the pre-implementation commit, resolve blocking findings, and rerun affected checks; verify the final diff is limited to this change and reports calibration, full-payload latency, and live deployment as unverified.
- [ ] 6.4 Present the completed implementation and owner setup steps without changing running settings or services; verify no persistent server/tunnel, owner-file edit, extension replacement, or enforcement activation occurred without separate approval.
