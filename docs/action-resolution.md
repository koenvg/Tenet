# Host-authenticated action resolution

Use this contract when an embedding host can describe the actual pending executor operation. It covers trusted in-process registration in a developer checkout. It does not provide a resolver for a stock host.

Supply optional `actionResolver` through SDK `createGuard`, private `GuardRuntime` options or Pi's `registerGuard` options. The runtime does not discover resolvers or resolve anchors itself.

Registration is trusted code, never a tool argument, tool description, environment setting or transcript entry. Before registering one, check [the companion executor obligation](#companion-executor-obligation) and [bounds and privacy](#bounds-and-privacy).

Stock Pi and Claude Code do not supply this registration. Their action resolution is unsupported. Choosing enforce does not authenticate facts or remove interception, argument-stability or host-version limits. Repository tests use injected fixtures, not deployed host packages.

## Separate facts, assessment and execution

```text
Host executor's pending operation
  |
  v
Trusted resolver -> Tenet validates and captures current facts
  |                                  |
  |                                  v
  |                            evaluator assessment
  v                                  |
Fresh revalidation before enforce release
  |
  v
Tenet permission -> host executes checked operation or rejects changes
```

The resolver describes executor-owned state. Tenet validates evidence and checks freshness. The host must keep the checked operation unchanged through dispatch. Facts are neither approval nor proof of execution, and Tenet does not lock the filesystem or certify stock executors.

## Registration and facts

The contract is in repository-only [`src/runtime/resolved-action.ts`](https://github.com/koenvg/Tenet/blob/main/src/runtime/resolved-action.ts). SDK users import its public types from `tenet`; see [SDK exports](sdk.md#exports-and-construction).

An `ActionResolver` supplies:

- `id`, integration `version` and declared operation `semantics`.
- `resolve({ binding, input }, signal)`, describing the actual pending operation, or returning `null` when it cannot resolve it.
- `revalidate({ binding, facts }, signal)`, returning a fresh description of that same operation, or `null` when it is no longer valid.

The host must keep registration outside agent-controlled configuration and messages. Signing or echoing agent claims does not establish executor semantics. Tenet trusts the embedding's code; it does not authenticate a remote process or defend against malicious code in its own process.

### Supply version-1 facts

| `ActionFacts` field | Meaning |
| --- | --- |
| `version` | Exactly `1`. Unknown versions fail closed. |
| `binding` | Exact host, native session, execution context, Tenet invocation ID, call ID, tool name, cwd and original-argument SHA-256 digest supplied by Tenet. |
| `integration` | Registered resolver ID and version. |
| `resolverState` | Executor-owned revision or generation for the pending action and resolution state. Not an agent anchor. |
| `coverage` | `complete` or `partial` for the entire invocation. |
| `operations` | Unique operation IDs, declared semantics, resources, content and relevant before/after values. |
| `limitations` | Material gaps, unsupported effects or ambiguous resolution. |

`OperationSemantics` is `file-edit`, `file-read`, `remove`, `move`, `execute` or `opaque`.

Each resource has `requested`, `resolved`, `identity` and `relation`. Give the requested reference, resolved path or resource name, stable identity/revision, and a `direct`, `link` or `ancestor` relationship. Supply aliases and link identities where material.

Describe parent-directory removal or movement as an ancestor operation, not a harmless edit to one child. Include both sides of a move and every known compound step.

`file-edit` needs before and after values for complete coverage. Content entries use `role: 'literal'` or `role: 'executed'` and JSON `value`. Literal patch text containing `git commit` does not execute Git.

`execute`, `opaque`, executed content, missing resources, undeclared semantics, redacted fields and reported limitations keep coverage partial. A harmless first operation cannot certify unknown later effects.

## Assessment and release

1. Tenet captures original arguments, then calls the resolver with a frozen copy and invocation binding.
2. It bounds and validates returned JSON, checks provenance, copies it, applies existing field redaction and freezes the evidence.
3. The evaluator receives current facts only in top-level `state.resolvedAction`. Status is `authenticated-complete`, `authenticated-partial` or `unsupported`. Similarly named tool arguments and history remain untrusted.
4. Built-in policy integrity is assessed independently against the active policy source and target, including resolved links and ancestor operations. Facts are never approval or an automatic rule exemption.
5. Before enforce release, including after native approval, Tenet asks the same resolver to revalidate. The unredacted snapshot must match the original binding and full facts digest. Missing, changed, malformed, cancelled or timed-out revalidation blocks with `action-resolution-stale`. Tenet checks arguments, lifecycle and policy freshness again after the asynchronous callback.

Snapshot equality uses the existing JSON digest convention, including property order. Return a stable serialization shape.

Reconstruct a fresh executor description while preserving the original facts. Returning the cached object defeats revalidation.

Observe captures facts before release and assesses that immutable snapshot in the background. It does not revalidate after execution or imply that an executed action is still pending. Resolution failure releases without an available assessment in observe, but blocks enforcement.

A `null` resolution is unsupported and uses ordinary assessment without authenticated facts.

Only complete, current host-authenticated facts can support `NOT_APPLICABLE`. Its selected-outcome threshold still applies; its evidence-confidence gate does not. Integrity, WARN and approval remain independent. See [assessment validation and gates](assessment-contract.md).

## Companion executor obligation

A successful check leaves a race between Tenet's return and dispatch. The executor must execute exactly the checked operation against checked identities and content, or reject it if anything changes.

Pin the pending operation, retain an executor-owned revision or use an equivalent atomic identity check during execution. Later Pi extensions, changed arguments, retargeted links, anchor reuse, replaced files and cancelled calls must not redirect an approved operation.

Tenet does not rewrite host arguments, acquire filesystem locks or certify stock executors. Resolver callbacks must not execute the action. A host that cannot meet this duty must not advertise complete coverage.

## Bounds and privacy

| Admission limit | Value |
| --- | --- |
| Each resolver callback | 100 ms, with abort signal |
| Returned facts | 16 KiB |
| Operations | At most 64 |
| Resources/content entries per operation | At most 64 each |
| Full current evaluator evidence | Configured budget, 24 KiB by default |

Strings, depth and node counts are also bounded. These are conservative admission limits, not permission to collect unrelated data.

### Fit current evidence before history

Current arguments, captured policy/context and material resolved facts take priority over optional content. Tenet chooses the richest metadata tier whose exact current-only request fits:

1. Full description and schema.
2. Description with schema omitted.
3. Neither description nor schema.

Retained fields are exact copies. After choosing the tier, the bounded selector reconsiders the original eligible observations. It prefers the newest chronological suffix and omits oldest history first. Failed fitting attempts do not add omissions to the final count.

`tool-metadata-omitted` reports removed optional fields; null description/schema values identify which are absent. Original unavailable markers remain. Final history counts include source omissions plus only the observations omitted by the final selection.

All markers and selection metadata count toward the existing byte limit. Defaults remain 24 KiB and 12 events; history is capped at one third of the state budget. Tenet never truncates required current evidence to claim complete coverage. If it or the minimal history envelope cannot fit, no evaluator request is submitted. `insufficient-evidence` vetoes only in enforce mode.

Descriptions and schemas are ordinary untrusted evidence, not authenticated effects or approval. Missing history never proves success. This selection order does not expand executor support, resolver guarantees or budgets, and historical submitted requests stay unchanged.

### Keep resolver callbacks bounded

Callbacks must be local, bounded and cancellation-aware. Tenet cannot preempt synchronous host code. Do not traverse arbitrary directories, run code, probe external systems or gather unrelated files to fill gaps.

Return unsupported or partial facts. Cancellation and timeout must release resolver-owned resources even if the callback does not settle.

Facts can contain source and secrets. Assessed facts go to TypeSafe and can enter local recordings; live evaluation uses API quota and needs separate authorization.

Existing credential-field and configured-field redaction applies to facts, requests and recordings. Redaction makes coverage partial; removing required structural fields makes resolution unavailable.

Embedded secrets in strings, paths or literal content are not reliably detected. Do not submit them. Raw revalidation facts stay inside the resolver contract and are not recorded.

## Diagnostics and conformance

Coverage reports `actionResolution: 'host-supplied'` only for explicit registration. This is not a conformance certificate. Without registration it reports `unsupported` and `target-resolution-unavailable`. The Claude owner CLI explicitly reports unsupported resolution.

Assessment records contain sanitized resolution status, facts and limitations. Submitted request archives contain the same evidence. History stays untrusted; an old authenticated assessment cannot authenticate a new invocation.

Owner results also carry bounded readonly `EvidenceContext`, version `evidence-context-v1`. It copies captured resolution status and limitations, redaction indicators and finalized history counts. It is not another fact bundle or an exemption input. Even history with no omissions cannot upgrade unsupported or partial coverage.

If capture cannot complete, resolution is unavailable. If current evidence cannot fit, known captured coverage can remain visible with unavailable preparation and no final history counters. Assessment availability is separate. See [diagnostic provenance and bounds](inspection-evidence.md#runtime-evidence-context).

### Test the actual executor before claiming coverage

An integration owner must test its executor and registration path for:

- Tool aliases, anchor reuse and ambiguous or absent targets.
- Symbolic links, hard links, changed identities and parent-directory operations.
- Every compound step, opaque effects and literal versus executed content.
- Wrong host/session/context/invocation bindings, changed arguments and replayed snapshots.
- Changes during assessment, approval and revalidation, and between release and dispatch.
- Cancellation, deadline expiry, stale generations and cleanup.
- Evidence limits, redaction and unavailable resolution.

Repository-only [resolved-action tests](https://github.com/koenvg/Tenet/blob/main/test/resolved-action.test.ts) and [resolver conformance tests](https://github.com/koenvg/Tenet/blob/main/test/resolver-conformance.test.ts) cover representations and rejection paths with injected fixtures. They do not certify a deployed executor after release. External integration work and end-to-end conformance evidence remain required.
