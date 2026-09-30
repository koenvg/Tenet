# Proposal

## Why

Tenet already checks coding-agent tool calls, but adoption requires a stable source checkout, development-oriented dependency installation, and a long operational guide. Make Pi users' first experience install, write a policy, observe useful findings, then explicitly opt into enforcement; extract the shared SDK from that working integration instead of selling another thin judge wrapper.

## What Changes

- Make Pi the first supported onboarding target. Supply a tested, relocatable local-install archive with the Pi extension, compiled SDK and CLI, production dependency metadata, and built inspector. No development checkout or frontend build is required for use.
- Provide a short Pi quickstart using existing `Rule;` declarations, secure credential configuration, observe-by-default operation, owner-only findings, explicit enforcement opt-in, and removal instructions.
- Add an offline `tenet doctor` command usable before starting Pi. Diagnose policy selection, local configuration, credential presence, recording settings, package contents, and the tested host range without contacting the judge or changing files. Separate local readiness from actual host-hook and provider verification.
- Expose a documented alpha TypeScript SDK through a dedicated package entry. The SDK owns shared policy, evidence, assessment, invocation-local approval checks, lifecycle invalidation, observation scheduling, control, and recording mechanics. Pi owns translation of native events and native UI.
- Move Pi onto that SDK entry and test the same interface an embedding developer uses. Preserve host coverage limitations rather than inferring trusted action facts or guaranteeing post-hook argument stability.
- Preserve current assessment behavior, thresholds, policy syntax, capture defaults, historical contract interpretation, and mode-specific unavailable handling. Simpler installation must not mean weaker enforcement or hidden data disclosure.

## Capabilities

### New Capabilities

- `pi-guard-onboarding`: Installable Pi delivery, offline setup diagnosis, a concise policy-to-findings path, privacy disclosure, and honest coverage reporting.
- `embedded-guard-sdk`: Host-independent typed SDK entry, shared runtime ownership, explicit adapter obligations, invocation and lifecycle safety, and Pi consumption of the same implementation.

### Modified Capabilities

None. Existing `session-policy-activation`, `global-tenet-control`, and `configurable-policy-enforcement` requirements remain in force. These additions do not change their policy selection, control, or decision semantics.

## Impact

- Package exports, CLI entry, production delivery manifest, build scripts, and `.github/workflows/ci.yml`; a new SDK entry around existing `src/runtime/`, `src/decision/`, and `src/recording/` implementation, plus `src/pi/guard.ts` integration wiring.
- New packaged-consumer, offline-doctor and SDK contract tests, with existing Pi smoke, runtime, approval, recording, and inspector checks retained.
- `README.md`, `docs/INSTALL-ARCHIVE.md`, and new SDK/onboarding documentation. Examples distinguish scripted enforcement mechanics from live semantic accuracy.
- This change does not publish to npm, create a public release, register a package name, install into the owner's Pi settings, disclose fixtures to TypeSafe, or authorize live evaluations. The existing private CI-artifact delivery remains the first distribution channel.
- Claude Code remains the existing unverified prototype. No new host support, general shell effect interpreter, tool-name exemptions, policy migration, prompt changes, new applicability contract, or separate assessment-only product is included.
- The in-flight `reduce-developer-friction` change overlaps runtime internals and contains historical design assumptions that differ from current source. Implementation must use the current recorded assessment contract, coordinate touched modules, and keep this packaging/integration change free of that change's semantic revisions.
