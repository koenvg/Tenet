# Host-authenticated action resolution

TENET accepts an optional `actionResolver` in `GuardRuntime` options and in Pi's `registerGuard` options. It is a trusted in-process registration supplied by the embedding, not a tool argument, tool description, environment setting or transcript entry. The shared runtime does not discover resolvers or resolve anchors itself.

Stock Pi and Claude Code integrations do not supply this registration. Their current action resolution is **unsupported**. The tests in `test/resolved-action.test.ts` and `test/resolver-conformance.test.ts` exercise injected fixtures, not deployed host packages. Existing interception, argument-stability and host-version limitations still apply.

## Registration and facts

The TypeScript contract is in [`src/runtime/resolved-action.ts`](../src/runtime/resolved-action.ts). An `ActionResolver` supplies:

- `id`, integration `version` and declared operation `semantics`.
- `resolve({ binding, input }, signal)`, which describes the actual pending executor operation or returns `null` when it cannot resolve it.
- `revalidate({ binding, facts }, signal)`, which returns a fresh description of that same pending operation, or `null` if it is no longer valid.

The host must keep registration out of agent-controlled configuration and messages. Merely signing or echoing an agent's claimed facts does not establish executor semantics. TENET trusts the embedding's code; it does not authenticate a remote process or defend against malicious code inside its own process.

A version-1 `ActionFacts` object contains:

| Field | Meaning |
| --- | --- |
| `version` | Exactly `1`. Unknown versions fail closed. |
| `binding` | Exact host, native session, execution context, TENET invocation ID, call ID, tool name, working directory and original-argument SHA-256 digest supplied by TENET. |
| `integration` | Registered resolver ID and version. |
| `resolverState` | Executor-owned revision or generation covering its pending action and resolution state. Not an agent-provided anchor. |
| `coverage` | `complete` or `partial`, covering the entire invocation. |
| `operations` | Unique operation IDs, declared semantics, resolved resources, literal/executed content and relevant before/after values. |
| `limitations` | Material gaps, unsupported effects or ambiguous resolution. |

Each resource includes its requested reference, resolved path or resource name, stable identity/revision, and a `direct`, `link` or `ancestor` relationship. Supply aliases and link identities where material. A parent-directory removal or move must be described as affecting the ancestor, not as a harmless edit to one child. Both sides of a move and every known step of a compound invocation belong in the facts.

`file-edit` facts need before and after values for complete coverage. Content entries have `role: 'literal'` or `role: 'executed'` and a JSON `value`. A patch containing `git commit` as literal text does not execute Git. An `execute` or `opaque` operation, executed content, missing resources, undeclared semantics, redacted fields or reported limitations keep coverage partial. A harmless first operation never certifies unknown later effects.

## Assessment and release

1. TENET captures original arguments, then calls the configured resolver with a frozen copy and the invocation binding.
2. It bounds and validates the returned JSON, checks provenance, copies it, applies existing field redaction and freezes the evidence.
3. The evaluator receives current facts only through top-level `state.resolvedAction`. Its status is `authenticated-complete`, `authenticated-partial` or `unsupported`. Tool arguments and history remain untrusted even if they contain similarly named objects.
4. Built-in policy integrity is assessed independently against the active policy source and target, including resolved links and ancestor operations. Facts are evidence, never approval or an automatic rule exemption.
5. Before enforce-mode release, including after native approval, TENET asks the same registered resolver to revalidate. The returned unredacted snapshot must match the original binding and full facts digest. Missing, changed, malformed, cancelled or timed-out revalidation blocks with `action-resolution-stale`. Arguments, lifecycle state and policy freshness are checked again after the asynchronous callback.

Snapshot equality uses the existing JSON digest convention, including property order. Return a stable serialization shape. Preserve the original facts while reconstructing a fresh executor description; blindly returning the cached object defeats the contract.

Observe mode captures facts before release and uses that immutable snapshot in its background assessment. It does not revalidate after execution or imply that an already executed action is still pending. Resolution failure releases without an available assessment in observe mode; it blocks enforcement. `null` resolution is explicitly unsupported and follows ordinary legacy assessment without authenticated facts.

## Companion executor obligation

A successful check does not close the race between TENET's return and dispatch. The companion executor must execute exactly the checked operation against the checked resource identities and content, or reject it if anything changes. It must pin the pending operation, retain an executor-owned revision, or perform an equivalent atomic identity check when executing. Later Pi extensions, changed arguments, retargeted links, anchor reuse, replaced files and cancelled calls must not redirect an approved operation.

TENET does not pass rewritten arguments to the host, acquire filesystem locks or certify stock executors. Resolver callbacks must not execute the action themselves. If the host cannot honor this obligation, it must not advertise complete coverage.

## Bounds and privacy

Each resolver callback has a 100 ms deadline and receives an abort signal. Returned facts have a 16 KiB admission budget, at most 64 operations, at most 64 resources/content entries per operation, and bounded strings, depth and node counts. These are conservative admission limits. The full current evidence still has to fit the configured evaluator budget, 24 KiB by default.

Callbacks must be local, bounded and cancellation-aware. TENET cannot preempt synchronous host code. Do not traverse arbitrary directories, run code, probe external systems or gather unrelated files to fill a gap. Return unsupported or partial facts instead. Cancellation and timeout must release resolver-owned resources even if a callback fails to settle.

Current arguments, captured policy/context and material resolved facts take priority over all optional content. TENET first chooses the richest metadata tier whose exact current-only request fits: full description and schema, description without schema, then neither. Retained fields are exact copies. Once that tier fits, the existing bounded selector reconsiders the original eligible observations, prefers the newest chronological suffix and omits oldest history first. Failed tier attempts do not add omissions to the final count.

The request includes `tool-metadata-omitted` when either optional field is removed; null description/schema fields show which fields are absent. Original unavailable markers remain. History reports source omissions plus only the observations omitted by the final selection. All markers and selection metadata count toward the existing byte limit. The default remains 24 KiB and 12 events, with history capped at one third of the state budget. TENET never truncates required current evidence to claim complete coverage. If that evidence or the minimal history envelope cannot fit, it submits no evaluator request and reports `insufficient-evidence`, a veto only in enforce mode.

Descriptions and schemas remain ordinary untrusted evidence, not authenticated effect coverage or approval. Missing history never proves success. This selection order does not expand executor support, resolver guarantees or the request budget. Historical submitted requests remain unchanged.

Existing credential-field and configured-field redaction applies to facts, requests and recordings. Redaction makes fact coverage partial; removing required structural fields makes resolution unavailable. Embedded secrets in source strings, paths or literal content are not reliably detected. Do not submit them. Raw revalidation facts stay inside the resolver contract and are not recorded.

## Diagnostics and conformance

Runtime coverage reports `actionResolution: 'host-supplied'` only for an explicit registration. This is not a conformance certificate. Without registration it reports `unsupported` and `target-resolution-unavailable`. Assessment records include the sanitized resolution status, facts and limitations. Submitted request archives contain the same evidence. History is separately marked untrusted; an old authenticated assessment cannot authenticate a new invocation. The Claude owner CLI explicitly reports unsupported action resolution.

Owner results additionally carry a bounded readonly `EvidenceContext`, version `evidence-context-v1`. It copies current captured resolution status and limitations, redaction indicators and finalized FIFO-history counts. It is not a second fact bundle or an exemption input. Unsupported and authenticated-partial coverage remain such even with no history omissions. If capture cannot complete, resolution is unavailable; if current evidence cannot fit, known captured coverage can remain visible with unavailable preparation and no final history counters. Assessment availability is independent. See [inspection evidence](inspection-evidence.md).

Before advertising complete coverage, an integration owner must test its actual executor and registration path for:

- Tool aliases, anchor reuse and ambiguous or absent targets.
- Symbolic links, hard links, changed resource identities and parent-directory operations.
- Every compound step, opaque effects and literal versus executed content.
- Wrong host/session/context/invocation bindings, changed arguments and replayed snapshots.
- Changes during assessment, approval and revalidation, plus changes between release and dispatch.
- Cancellation, deadline expiry, stale generations and executor cleanup.
- Evidence limits, redaction and unavailable resolution.

The repository's contract fixtures cover these representations and runtime rejection paths but do not certify a deployed executor's post-release behavior. External integration work and its end-to-end conformance evidence remain required.
