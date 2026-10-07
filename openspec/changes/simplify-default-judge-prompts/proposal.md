# Proposal

## Why

Tenet contributors need shorter default prompts and smaller, check-specific model inputs for both APUS and JEV, while keeping the four safety checks. Repeated instructions dominated the measured native prompts, and one complete synthetic APUS assessment took 152296.3 ms and misclassified a harmless read; smaller inputs may reduce work but do not promise faster or correct results.

## What Changes

- Make one shared, check-specific preparation path the normal default for APUS and JEV. Add no experiment mode, production toggle or parallel legacy judge.
- Give each user-rule check and its evidence check exactly four ordinary data fields: one rule, the latest supplied thinking trace or explicit unavailability, the previous tool name and arguments or explicit absence/unavailability, and the proposed tool name and arguments.
- Exclude the previous tool result, full or bounded transcript, history-reference/escape grammar, policy source/path metadata, cwd, resolved-action facts and sibling checks' inputs from that ordinary context. Arguments remain literal untrusted data, including approval claims and marker lookalikes.
- Give the policy protection check only the built-in rule, proposed call and required policy sources, targets, candidates and current resource/coverage data. Give the exemption check only the user rule, proposed call and current host-verified facts needed to assess its complete scope. Neither receives ordinary thinking or previous-call context.
- Keep rule check, evidence check, policy protection check and exemption check, with current outcome labels, thresholds, full-assessment validation and approval gates. A rule-check NOT_APPLICABLE score cannot itself establish an exemption; the exemption check must supply its own verified-data outcome score and exact facts reference, then pass current host validation. Missing required evidence never becomes a fabricated pass.
- Change provider submission so scoped inputs are actually separate. APUS renders each question with its own state. JEV uses separate SDK submissions for groups that need different state, rather than placing every group's data in one shared state.
- Use concise, self-contained instructions for each check. Preserve native scoring, transport bounds, whole-assessment deadlines and model identity checks. Add wording later only when measured fixture results show a need.
- Version the new questions, scoped submitted-input contract and capture shape where needed. Preserve assessment labels, recording controls and interpretation of historical records; do not mislabel old shared-state captures as new scoped requests.

## Capabilities

### New Capabilities

None. This changes the normal core judge path.

### Modified Capabilities

- `configurable-policy-enforcement`: Use concise check-specific inputs and instructions by default for both providers, retain all four checks and enforcement gates, and record the submitted scopes under their own versions.

## Impact

The change affects shared question/input preparation, both provider adapters, exact input budgeting, assessment assembly and version-aware recording/inspection. Existing native renderer, transport, scoring, policy protection and host-verification helpers remain in use. No new dependency or general prompt framework is needed.

Offline fixtures cover trace present/unavailable, previous call present/absent/unavailable, literal approval claims, facts isolation, provider isolation, partial-response failure and unchanged gates. A separate small full-assessment comparison plan reports prompt size, complete latency, labels, failures and complete/planned counts. Fixture calls never execute.

Thinking text is used only when already supplied by the host. Current Pi and Claude evidence paths do not supply it, so their initial default is explicit unavailability. Present-trace tests use authored synthetic text. No real-session ingestion, new capture hook, hidden-reasoning retrieval or invented summary is added.

This corrects the earlier wording-only design. Keeping the safety checks does not mean sending every check the old shared payload. The normal proposal can lead to a reviewed core change for `main`; implementation, merge and deployment need separate authorization.

TENET-104 and parent conversation `bbthread://thr_rhy4i9w4hm` are context, not an assignment to change task status or run a live test.

## Non-goals

No check removal, fabricated passing answers, new policy restriction, calibrated safety claim, model/quantization change or cache tuning. No fixture execution, owner-policy access, real-data disclosure, service/tunnel/download change, owner-setting change, implementation, commit, publication or live evaluation is authorized by this planning request.

Future live comparison needs separate approval for exact synthetic payloads, destination, request count, CPU budget, capture choice and logs. This proposal does not start the currently stopped servers or tunnels.
