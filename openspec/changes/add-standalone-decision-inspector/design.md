## Context

See proposal.md for motivation and scope. `owner-reports.ts` renders two selection menus and keeps only 100 recent concerns. `guard.ts` already records assessment, decision, approval, permission and execution stages with invocation identities; session records contain distributions but not submitted evidence. `jev.ts` builds questions and state at the SDK boundary. `judge-evidence.ts` bounds trajectory before submission, and `questions.ts` maps positional question keys to snapshot rule IDs. These are the capture seams; rebuilding requests from session logs would lose exactness.

The project uses TypeScript, Bun tooling, a Node-compatible Pi extension and the TypeSafe SDK. No web app or storage service exists. Tests already inject judges and SDK fetch, and verify owner-only reporting and observe-mode failure isolation. The main spec forbids new request logging; this change modifies that requirement only for a separate archive. Existing observe-mode owner-only behavior remains intact. The design is required because the change crosses transport, persistence, UI and security boundaries.

## Goals / Non-Goals

- Preserve a stable, inspectable record of what TENET submitted and how validated results became decisions.
- Keep capture and the standalone reader independent of agent context, evaluator semantics and enforcement.
- Support concurrent projects and resumed sessions without a running dashboard or recording daemon.
- Do not add policy editing, browser approvals, request replay, remote hosting, cloud sync, hidden model reasoning, or automatic import of old Pi session files.
- Owner-only means no automatic delivery to the agent, not protection against an agent with the owner's filesystem access.

## Decisions

### Capture once at the application request boundary

Add a versioned recording contract and injected best-effort event sink, separate from decision contracts. Build one immutable JSON-compatible request payload containing model, questions and state in `jev.ts`; submit that same payload and give its snapshot to the recorder. Attach an invocation-scoped sink from the guard so asynchronous results cannot be attributed to the wrong session after switching or resuming. Record question-key-to-rule-ID mapping, question version, thresholds, source/target/digest and rule severity alongside the payload. Severity is metadata, not a new evaluator input.

Exact means the application payload supplied to `systemOne`, not provider-internal prompts or HTTP headers. Scripted SDK fetch tests compare the persisted semantic payload with the actual serialized outbound request to catch SDK serialization differences. Store the SDK-returned application response before validation, then the validation outcome and validated assessment. Do not serialize arbitrary Error objects, SDK clients, environment variables or transport headers. Use safe error categories; malformed response content is untrusted.

Apply a documented 1 MiB limit to diagnostic response snapshots, with byte count and explicit truncation markers. Submitted request evidence is already bounded; do not silently truncate it again and call it exact. A serialization or queue limit failure marks capture incomplete. Missing credentials or early guard failures receive lifecycle records with request-not-submitted status. Never fabricate a request for an injected judge that did not call the provider.

Alternative: instrument global fetch or reconstruct prompts in the UI. Both obscure identity and can leak headers or show a request different from the one assessed.

### Store immutable stage files in a per-user archive

Use `~/.tenet/recordings` by default, with an absolute `TENET_RECORDING_DIR` override and `TENET_RECORDING=off` opt-out. Resolve recording settings separately from policy/enforcement config so invalid recording configuration degrades recording only. Announce default-on recording and its location through owner-only UI.

Use a SHA-256 encoding of session ID for directory names, preserving the original session ID inside every record. Under each session directory, give each process start a random writer ID and write immutable stage records with monotonic writer sequence and globally unique event IDs. Include invocation ID, tool call ID, tool name, timestamp, captured working directory, mode and schema version. Multiple writers do not append to one shared file. Resumed sessions accumulate records; forked session IDs use distinct directories. Project filtering uses captured canonical working directories, with fallback to the original path if resolution fails, and does not merge worktrees by inferred Git remotes.

Write each record through an exclusive temporary file and atomic rename, using owner-only directory/file permissions. Reject symlink escapes and unsafe pre-existing storage paths rather than following them. The reader ignores temporary files, validates size and schema, and reports malformed or unsupported records individually. Lifecycle ordering uses sequence within a writer and recorded identities, not timestamps alone. Do not overwrite or migrate historical records in place.

Use a bounded asynchronous write queue, proposed defaults of 64 pending events and 16 MiB pending bytes. Archive I/O must not enter the judge deadline or approval path. Drain with a bounded timeout at normal shutdown; abrupt process death can lose pending stages. Queue exhaustion and write errors increment owner-visible capture-health counters, with a health record when storage recovers. The UI must never claim complete capture solely because it sees some records. This is a debugging archive, not a transactional execution audit log.

No automatic retention expiry in v1. Document disk growth and manual removal while writers are stopped. An owner-restricted archive is sensitive local data, not encrypted storage.

Alternative: SQLite offers indexing but adds a shared write/driver concern across the supported extension runtimes. Immutable files avoid a daemon, shared locks and runtime-specific database bindings at this scale. Keep storage behind a narrow writer/reader contract so indexing can change later.

### Keep recording out of existing diagnostic channels

Add a recording module owning serialization, queueing and health. The guard emits lifecycle records through the sink without duplicating raw payloads in `pi.appendEntry`. Existing safe session records and `/tenet` behavior remain compatible. Extend owner status only with recording health/location, never with evidence messages. Capture both pass and concern paths before the current recent-concerns filter.

Do not feed new archive records into live or recovered trajectory. Archive failures cannot veto, approve, release early, consume approval timeouts, or mask the original result. Compare recording on/off/failing in both modes with the existing guard harness. Exceptions in capture callbacks must be contained at the sink boundary.

### Standalone Svelte frontend with a local read-only server

Add a separate frontend directory for Svelte + Vite and a Node-compatible TypeScript backend under an inspector module. The standalone launch command serves built frontend assets and the archive API without loading the Pi extension or TypeSafe client. Bun remains the repository's build/test runner; the extension does not import Svelte or server code. A native desktop wrapper and installation packaging are out of scope for v1.

The reader provides a session index, cursor-paginated invocation summaries and on-demand invocation detail. Read payloads only on detail requests; maintain a rebuildable in-memory index of immutable files. Poll from the browser every two seconds for live updates, preserving selection and scroll. Polling is simpler than SSE or a watcher recovery protocol here; persisted files remain authoritative after disconnects and restarts.

The UI has a session/project browser, call timeline, rule table and detail tabs for decision, questions/choices, submitted evidence and response. Show all rules, including integrity and passing rules. Derive friendly gate explanations from recorded gate IDs, never by rerunning current decision logic. Full distributions are labeled model probabilities, not calibrated safety guarantees. Shared evidence appears once per invocation and is linked from each rule.

Display mode, would-decision, permission and execution as separate fields. Missing response, capture gaps, unavailable assessment and unknown execution have explicit states. Existing pre-feature Pi session files are not automatically imported; any partial archive record is shown honestly without reconstructing missing evidence.

### Protect local evidence access

Bind to loopback only. Generate a per-launch access token; print a local URL with the token in the fragment rather than a query string. The frontend removes the fragment after loading and sends the token in an authorization header; evidence APIs require it. Reject unexpected Host and Origin values, do not enable permissive CORS, and do not log authorization values or payloads. Development mode uses the same backend checks with an explicit local Vite origin.

Serve no arbitrary file paths. Resolve opaque IDs through the archive reader, enforce root containment, reject symlink traversal, and bound API page sizes and record reads. Render all archive content as escaped text, without raw HTML or active Markdown. Use a restrictive content security policy and no external scripts, fonts or telemetry. Responses containing evidence use no-store caching. No mutation endpoints, provider calls or shell execution exist in the inspector.

Alternative: loopback binding alone is insufficient because hostile websites can attempt access to local services. A read-only UI alone also does not prevent evidence disclosure.

## Risks / Trade-offs

- Default-on sensitive persistence -> preserve submitted redaction, omit transport credentials, restrict permissions, clearly announce the default and document opt-out/removal. String-embedded secrets can remain.
- Crash or disk failure loses queued stages -> mark incomplete history, expose health where possible, flush on graceful shutdown and never promise audit-grade durability.
- Unbounded retained history consumes disk -> document no automatic expiry, show recording failures rather than silently dropping old sessions, and use paginated/lazy reads.
- Malformed records or hostile evidence -> validate version/size, isolate record failures, escape all content and reject filesystem escapes.
- SDK upgrades alter serialization -> contract tests compare recorded inputs with scripted outbound payloads; retain question and schema versions.
- Existing unarchived changes overlap the main spec -> keep this delta limited to Safe diagnostic payloads, retain their owner-only behavior and reconcile that requirement deliberately at archive time.

## Migration Plan

1. Introduce recording contracts and offline tests, then wire default-on capture independently of existing session diagnostics.
2. Add the read-only backend and Svelte build/launch commands. The inspector reads only the new archive and requires no Pi process.
3. Publish README guidance for storage, sensitive evidence, opt-out, launch, session navigation, live updates and removal. Existing users must see that persistence behavior changed.
4. Verify existing Bun tests, Pi smoke tests and typechecking, plus archive/server/UI tests and the frontend production build. Use scripted provider responses only; live provider evaluation requires separate authorization.
5. Manually inspect a synthetic live and restarted session in the owner's Arc browser when available. If unavailable, report the missing browser check rather than switching browsers without approval.
6. Rollback removes the new capture/UI code or disables capture; existing Pi diagnostic records remain readable. Archived files remain local until explicitly removed and are never sent to an older evaluator.
