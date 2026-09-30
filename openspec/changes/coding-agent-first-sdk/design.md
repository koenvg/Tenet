# Design

## Context

See [proposal.md](proposal.md) for motivation and scope. This design changes delivery and integration structure, not semantic assessment.

Observed in this checkout:

- `package.json` is private, declares `src/pi/extension.ts` as its Pi resource, and has no SDK exports or generic CLI binary. Its scripts and dependency graph primarily support development.
- CI manually copies source, the development manifest and lockfile, docs, and built inspector assets into a 14-day install archive. The install guide requires unpacking into a stable location, installing dependencies, and registering that directory with Pi.
- `src/pi/guard.ts` constructs the judge, activation store, archive writer and shared runtime alongside native approval and owner-reporting modules. The reusable execution mechanics already live in `src/runtime/guard.ts`, `src/runtime/consequences.ts`, `src/decision/`, and `src/recording/`.
- Pi's adapter declares missing argument stability and full result correlation. It has native approval but no stock authenticated action resolver. A smoke-tested host dispatcher is not proof of actual execution or semantic accuracy.
- Current source uses asynchronous bounded observation and the single `applicability-v1` assessment contract. The older `reduce-developer-friction` design describes a legacy/profile switch and synchronous baseline that are no longer current. This change must not restore either.
- Claude Code remains an unverified bridge prototype. It is not a supported onboarding target here.

Pi package documentation confirms local directories are loaded in place, not copied or dependency-installed. Therefore a private local archive cannot honestly offer the same one-command experience as a published managed package. We improve that path without pretending a registry release exists.

## Goals / Non-Goals

**Goals:**

- Hide runtime bookkeeping behind one deep module that Pi and SDK consumers actually use.
- Make setup problems diagnosable without sending code to a provider or starting an agent.
- Verify the delivered files from outside the repository, including their runtime and type declarations.
- Keep the owner workflow free of adapter configuration, fact schemas, and SDK code.

**Non-Goals:**

- Browser support, an HTTP decision service, a hosted control plane, a new provider abstraction, or a public registry release.
- Guaranteed shell-effect interpretation, automatic trusted facts, transactional execution control after Pi hook release, or stronger host coverage than the adapter demonstrates.
- A new policy language, new thresholds, historical-record migration, or automatic changes to owner policy, credentials, Pi settings, or installed extensions.

## Decisions

### 1. One alpha SDK entry, based on the existing runtime

Add a curated `tenet-publication-guard/sdk` export backed by a new `src/sdk/` module. Retain the current package name and private status. Build ESM JavaScript and TypeScript declarations for Node and Bun; do not require consumers to transpile Tenet source or install Pi, Svelte, browser tooling, or the inspector to import this entry.

The external seam is a guard factory with session handles. The proposed interface is:

- `createGuard(options)` configures the host's declared capabilities, owner-event delivery, and runtime settings. Normal construction uses the existing Jev, control and recording defaults. Documented dependency injection supports judges and sinks for embedding and offline tests.
- `openSession(identity, cwd)` establishes policy eligibility and readiness before calls.
- A session handle offers `beforeTool`, `afterTool`, `endTurn`, `invalidate`, `status`, and `close`.
- The guard exposes bounded disposal for all owned sessions, activation watches and archive work.

Keep host-specific transcript recovery and native UI in the adapter. Supply bounded observed history through the session interface rather than exporting the runtime's internal observation class. Ordinary calls pass tool identity, original arguments, metadata, cancellation, and a host callback to reread the current invocation before release. Identity and lifecycle obligations are explicit in the documented types; this is not a free-standing boolean `check` function.

The SDK owns shared startup, activation subscription, lazy judge creation, archive binding, assessment scheduling, and teardown. Move this wiring out of Pi rather than adding an independent policy engine. Keep decision labels, diagnostics and assessment status as curated value types. Internal runtime classes, queue controls, prompt builders and archive schema-folding helpers are not public contracts.

Importing the SDK has no filesystem, network, watcher or provider side effects. Opening an eligible session may start the existing runtime facilities. A dormant session must still produce no new evidence or TENET UI effects. Construction and close must be tested for resource ownership and idempotency.

Rejected alternatives: exposing every source module makes internal changes consumer breakages; an assessment-only SDK leaves safe execution bookkeeping to every caller; a separate general-purpose execution engine duplicates the existing safety logic. The alpha SDK has an explicit version and no compatibility shims for old internal imports.

### 2. Pi is the production consumer of the same SDK

`src/pi/guard.ts` consumes the documented SDK entry, translating native session, tool-call, result and lifecycle events into its session handles. Native approval queuing, selectors, footer reporting, host exception handling, and transcript parsing remain Pi adapter responsibilities.

Pi declares only the coverage it currently has. The SDK rechecks the policy, generation, control state, identity and argument digest before enforce permission is released, including after approval. This is the current hook-level guarantee; it cannot freeze Pi's executor after release. Documentation and status must retain that limitation.

The before-tool result separates actual permission from assessment. In observe mode permission may be released with an assessment still pending; later events report findings to the owner without changing that permission. Off and dormant are explicit bypass reasons, not passing assessments. In enforce mode only a current terminal authorization permits release. ASK is an assessment result, not an executable permission or reusable approval token. No trusted approval channel means an approval-requiring invocation cannot be authorized.

Result notifications preserve unknown execution when correlation is insufficient. `endTurn` ends unmatched execution tracking without cancelling otherwise valid observation; context changes and disposal invalidate the appropriate generation. No user of the SDK needs to manage approval hashes or observation queues themselves.

Rejected alternatives: keeping Pi's old wiring beside the SDK prevents the main integration from testing the public interface; automatically wrapping arbitrary executors implies guarantees that native Pi hooks do not provide. A synthetic embedding demonstrates the SDK contract, not a second supported agent host.

### 3. A relocatable production archive, with no publication side effects

Keep the existing private CI artifact channel and stable local-directory install. Produce the archive through one checked-in packaging command, shared by CI and delivery tests, instead of maintaining another file list inside workflow YAML.

The delivery contains compiled SDK/CLI code and declarations, the Pi adapter resource, necessary inspector server runtime and built frontend assets, runtime docs, and licenses. Keep Pi's host module external, with host peer metadata that does not force its installation for an SDK-only consumer. Host compatibility is verified against the repository's pinned Pi version, independent of permissive peer metadata.

Generate a production-only delivery manifest and matching dependency lock from declared runtime dependencies. It must not copy development scripts pointing to absent tests or Svelte source. Users install production dependencies once from that manifest, then register the extracted directory using the documented Pi local-package command. SDK consumers can use the same directory as a local package dependency. Maintain source-checkout developer scripts separately.

Keep the Pi adapter as a thin TypeScript resource if that is what the pinned loader supports best, but make it consume the built SDK entry rather than private source runtime imports. Importing the SDK must not load Pi. Build the SDK before developer smoke tests and produce the inspector assets before packaging.

Do not bundle a physical Pi host dependency, copy a developer `node_modules`, or include recordings, fixtures, owner policy, credentials, repository paths, or mutable state. A packaged-consumer test relocates the archive into a temporary directory outside the checkout and exercises it without repository imports.

Rejected alternatives: a source clone preserves current setup friction; a registry install requires a separate publication decision; shipping a development dependency tree is large and hides dependency mistakes. There is still a stable-directory and credential setup step in this first delivery, which the quickstart must acknowledge.

### 4. An offline doctor uses the same readiness rules

Add `tenet doctor --cwd <project>`, with optional `--json`, to the compiled CLI. The archive guide supplies a direct Node invocation for users who have not installed a global binary. Parsing and readiness helpers are shared with the SDK, but doctor must not open a runtime session, instantiate an archive writer, subscribe to control, launch Pi, run a tool, or construct a provider client.

Doctor reports:

- Selected policy source, validity, digest and rule count, or dormant/unavailable with a bounded cause.
- Configured observe/enforce mode, relevant configuration errors, cooperative control state, and capture configuration.
- Whether an API credential is locally configured, never its value or proof that it works.
- Package/build completeness and the tested Pi version. An installed host version is reported only when safely discoverable from local metadata; otherwise it is unknown.
- Explicitly unverified provider connectivity and host-hook activation. A locally ready package is not a running guard.

Reuse current path selection, policy parser, configuration and safe-control checks. Do not test directory writability by writing a file. Recording configuration is not archive durability, and control state is not interception coverage.

Use exit code 0 for a coherent ready, off or dormant setup and nonzero for invalid or unavailable local setup. Structured output distinguishes these states so a script cannot interpret dormant/off as evaluated ALLOW. Unsupported detected host versions report unavailable compatibility with an upgrade/pin action, not guessed coverage. Unreadable values report unknown/unavailable rather than exposing raw errors or secret-bearing content.

Rejected alternatives: a live self-test incurs disclosure and quota; a setup wizard changing settings silently is hard to review; separate policy parsing in doctor drifts from actual activation.

### 5. A short owner path, with privacy before the first call

The quickstart separates one-time delivery installation from per-project use. After installation, users configure their credential with their normal secret manager, write an explicitly marked `Rule; BLOCK;` declaration in their own `TENET.md`, run offline doctor, restart Pi, and verify owner status before asking the agent to act. They do not write SDK code or register tools.

Do not bundle an automatically active policy or tell the guarded agent to rewrite its selected policy. Document that absent local/explicit policy means dormancy and no `/tenet` command; doctor remains available outside Pi. Explain that observe permits calls and findings may arrive later, and that `TENET_MODE=enforce` requires a new process. `/tenet on` does not select enforcement.

Before any example live call, disclose that rule text and submitted evidence reach TypeSafe, and that local capture defaults on and can contain secrets. Give `TENET_RECORDING=off` before-launch instructions alongside the happy path. Explain that capture opt-out does not stop provider disclosure and off does not erase old records. Uninstall removes loading, not historical evidence.

Demonstrate findings and native approval through offline scripted tests. Do not ask a new user to publish code merely to check setup, and do not present offline examples as semantic accuracy measurements.

Rejected alternatives: an SDK-first tutorial imposes integration work on coding-agent users; a single optimistic green status conceals missing provider/host verification; a long reference-first README hides the practical entry point. Keep the reference available after the short path.

## Risks / Trade-offs

- The SDK can become a shallow export collection. Mitigation: move shared construction and disposal into it, make Pi use it, and test consumers through session handles rather than private state.
- Alpha consumers may overestimate guarantees. Mitigation: explicit host obligations, conservative unavailable results, documented post-hook races and result-correlation limits, and visible assessment-versus-permission states.
- Compiled packaging can accidentally pull in Pi or rely on repository paths. Mitigation: optional host peer handling, artifact-content assertions, relocatable Node/Bun import tests, and pinned Pi loader smoke tests.
- Private archive distribution remains less convenient than managed installation. Mitigation: production-only dependencies and a short verified recipe now; keep registry publication a separately authorized follow-up.
- Default capture and provider disclosure can surprise owners. Mitigation: put opt-out and disclosure before the first assessed action, preserve existing defaults, and keep doctor offline.
- Runtime modules overlap `reduce-developer-friction`. Mitigation: use current source contracts, avoid prompt/profile/schema changes, rerun shared regressions after integration, and do not rewrite other changes' planning artifacts.

## Migration Plan

1. Add public-interface contract tests and the SDK module using existing decision/runtime behavior. Build declarations and verify host-free import before moving Pi.
2. Move Pi shared wiring onto the SDK and retain the existing native event, approval, reporting and lifecycle tests. Run synthetic SDK and pinned-host tests against the same implementation.
3. Add offline doctor and the production packaging command. Verify the extracted package with an isolated consumer and isolated Pi settings before changing the CI artifact job.
4. Replace development-oriented archive instructions with the verified production recipe, SDK guide and short owner quickstart. Keep Claude's prototype warning unchanged.
5. Run all checks in `CONTRIBUTING.md`, including inspector checks, plus package and consumer tests. Live TypeSafe calls and owner installation are not part of acceptance.
6. Deliver through CI artifacts only. Owners explicitly choose to replace their stable installation and restart Pi. Rollback uses the previous complete archive and a process restart; recordings and policy files are not rewritten. A rollback before the SDK exists removes that SDK entry, which must be stated to alpha consumers.
