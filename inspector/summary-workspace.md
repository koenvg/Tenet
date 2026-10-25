# Build and use the shared summary workspace

Use this developer-checkout reference to build the shared React summary library for both BB overview entry points and common-summary previews. The standalone inspector has a separate rule-first shell. Both interfaces share recorded-rule status presentation. See [the BB overview guide](../bb-plugin-tenet-status/README.md) for main-page selection, the thread panel and safe host reads.

## Build the library and plugin

Use Bun 1.3.14+, Node 22.19+, the [locked development dependencies](../CONTRIBUTING.md#set-up) and an installed BB CLI for plugin builds. Keep `TYPESAFE_API_KEY` unset for offline checks. Do not use real archives in previews. Recorded rule text and commands or paths can contain secrets even when the summary excludes evidence.

1. From the repository root, build both local outputs:

   ```sh
   bun run plugin:build
   ```

   This rebuilds the React library, scoped CSS and TypeScript declarations in ignored `bb-plugin-tenet-status/.summary-workspace/`. React stays external so BB uses its existing React runtime. The command then runs `bun run --cwd bb-plugin-tenet-status build`. Nothing is installed or reloaded.

2. Check the library and React adapter:

   ```sh
   bun run inspector:check
   CI=1 bun run inspector:test:components
   bun run --cwd bb-plugin-tenet-status typecheck
   bun run --cwd bb-plugin-tenet-status test
   ```

Success means each command exits zero. A missing or stale library stops the plugin build with `bun run summary:build` as the fix. Run that command from the root before importing the wrapper. The build stamp checks source content, not file modification times. Use the [full offline verification order](../CONTRIBUTING.md#check-a-change) for application and standalone workflow checks.

For presentation changes, select checks by owner:

| Changed area | Focused regression coverage |
| --- | --- |
| Standalone session-rule shell and private detail | [session-rule components](tests/components/session-rules.vitest.ts) and [standalone session-rule journeys](tests/integration/session-rules.pw.ts), within all three [Inspector test lanes](tests/README.md). |
| Shared BB overview and adapter | [thread-rule plugin checks](../bb-plugin-tenet-status/thread-rules.vitest.tsx), [mount checks](../bb-plugin-tenet-status/summary-workspace.vitest.tsx) and [thread-rule journeys](tests/integration/thread-rules.pw.ts) for both panel and main-page entry points. |
| BB main-page routing and selection | [main-page plugin checks](../bb-plugin-tenet-status/main.vitest.tsx) and [main-page journeys](tests/integration/bb-main.pw.ts). The picker and dashboard are outside the shared overview. |

Run browser checks with synthetic data in the [isolated validation environment](../CONTRIBUTING.md#run-focused-checks-in-a-clean-shell). The component command above does not run journeys. The complete offline lane includes these checks; success does not prove native BB focus, live evaluator connectivity or active host hooks.

## Preview safe synthetic data

This source-only preview uses authored summaries. It reads no archive, sends no evidence, starts no standalone inspector listener and calls no evaluator. It is not a running-BB or remote-host acceptance check.

1. From the repository root, start Vite:

   ```sh
   bun run summary:preview --port 52351
   ```

2. Open `http://127.0.0.1:52351/summary-preview.html`. Add `?container=390` for a 390px workspace inside a wide window. Also test a 390px browser viewport.

   Add `?case=v2-hosted`, `?case=v2-loopback`, `?case=v2-failure`, `?case=v2-apus`, `?case=identity-absent` or `?case=v2-injected` for authored identities. The default `synthetic-pass` has historical TypeSafe v1. Combine a case with `&container=390`.

   Open **Recorded judge** to inspect historical fields and provenance. Failure has no returned model.

3. Use Calls and Summary at compact widths. Coverage and Refresh archive remain outside these views. Stop Vite with Ctrl+C when finished.

The list and summary appear beside each other above a 650px workspace width. The compact navigation uses the workspace container width, not the window width. If port 52351 is occupied, use the URL Vite prints.

Open `http://127.0.0.1:52351/comparison-preview.html` for the common-summary-only comparison. Both fixture adapters receive the same authored data, selection and category filter. Summary disclosures and compact navigation stay synchronized when you use either side. This preview preserves the earlier call-summary comparison, not the current standalone rule-first shell or BB's default thread-rule overview.

Add `?container=390` to compare 390px containers inside a wide window. Check that shared fields have the same content, order and positions, not only that they fit. The preview starts without raw extensions, so omitted raw content cannot change the common layout.

Select **Show standalone-only inspection**, or add `?raw=1`, to show Recorded data after the left summary. Full submitted action, captured policy, exact questions, evidence, response and recording details stay in that private section. BB receives only the bounded selected command or path, not the raw argument object. The left workspace can become taller; its common summary rows retain their positions.

## Summary input

The source contract is [shared/model.ts](src/shared/model.ts). It is a presentation contract, not the authenticated BB transport schema. BB host adapters construct an allowlisted, validated summary before serialization. TypeScript types alone do not enforce a privacy boundary.

`SummaryWorkspaceInput` is a tagged presentation input with `variant`, `model` and `actions`.

- `variant: 'thread-rules'` renders the BB thread inventory, selected-rule checks or selected-call summary. The model includes the safe recorded-rule page.
- `variant: 'calls'` retains the call-oriented workspace for common-summary consumers and explicit **Browse calls** navigation.
- `actions` supplies navigation, refresh and page callbacks. The adapter owns transport, ten-second polling, cancellation, timeout and route restoration.

The BB default is **Recorded rules for this thread**, not an automatically selected call. Rule selection opens recorded checks. Each check selects its opaque linked session and call together, then opens `SummaryDetail`.

Thread inventory and check pages contain at most 50 items. Inventory aggregation retains at most 1,024 rules, and each selected rule retains at most 4,096 checks. Omission counts, missing inventory, indexing and capture limitations remain visible.

Findings use the standalone labels **No violations found**, **Violation found**, **Unclear** and **Not checked**. None establishes complete capture, permission or execution.

Thread-rule DTOs contain opaque identities and revisions, declaration labels, excerpts bounded to 512 UTF-8 bytes, statuses, counts, conflicts and safe codes. They exclude source paths, raw policy identity, freeform reasons, unknown gate strings and private stage objects. Unknown gates remain explicitly unresolved.

The owner-derived read scope and source revision bind every continuation. A changed scope or rejected page clears stale results and offers a page-one restart.

`SummaryCall` has an opaque ID, call/tool labels, timestamp, mode, recorded decision, permission, execution, categories, missing-stage codes, assessment status and safe failure code.

`SummaryDecision` has call and tool identity, mode, recorded facts, approval, reason code, the recorded no-violation flag, rules and a required `judge` subset.

Its selected-only `recordedAction` contains one scalar `command`, `path` or `file_path` from the retained request, or `null` when unavailable. The 4096-UTF-8-byte bound preserves stored whitespace and marks shortening. No raw arguments, evidence, questions or provider responses enter this model.

`reportedViolations` contains at most 16 compact selected-FAIL rule records, a whole-call total and a missing-snapshot count. WARN stays advisory.

BB attribution uses the retained request snapshot, even when missing or empty. The begin snapshot applies only when no request was retained.

The required `uncertain` flag covers all recorded rule facts before pagination or finding limits. Missing selected gates and any recorded gate other than `rule-fail` make the flag true. Unavailable assessments also set it true.

The view uses this flag with the completeness check before showing a clean no-violation message. Neither adapter recalculates thresholds or uses current policy.

Missing validation withholds the subset even when the stage fold says completed. Neither field enters call lists, status, findings, logs or URLs.

`SummaryJudge` allowlists implementation, requested and returned aliases, judge report version, canonical origin, transport, authentication mode, experimental status and recorded configuration with per-field provenance. Both adapters use the pure recorded-only `summaryJudge` projection.

The strict BB RPC schema rejects extra fields and incoherent v2 combinations. Compile-time checks require its judge shape to agree with the model.

Origins have a separate 2048-character bound and are validated whole, never truncated to the 256-character label limit. Canonical HTTP loopback port 80 omits `:80`. V1 TypeSafe retains `typesafe`; v1 or absent destination, transport and auth stay not recorded.

Unknown or injected v2 fields stay unknown. Non-completed evaluator state withholds the returned alias, including conflicting terminal stages. No current settings or bearer reference names enter this subset.

The optional `explanation` holds whole-call blocking facts: blocker count, whether all recorded blocking gates are uncertainty gates, and the first blocker's built-in identity, line, gate, scores and thresholds. Paginated HOST summaries require this strict, bounded context.

Both adapters derive it from the complete snapshot through `summarizeBlockingRules`; changing the inspected rule page cannot change the call explanation. It contains no rule text or raw payload.

`SummaryRule` has recorded ID, inert text, line, `enforcement` severity, built-in identity, selected outcome/evidence scores and probabilities, gates, contribution, effective thresholds, evidence-gate status and assessment profile. The optional recorded source origin retains role, path, target, digest and line; BB bounds its labels to 256 characters. Nullable scores, thresholds and gates remain unknown. The view never compares current policy or recomputes classifications.

BB transport limits are 50 sessions/calls per page, 16 rules per page, 512-character cursors, 256-character labels, 2,048-character origins and rule text and 20 issue codes. Host reads preserve explicit text/page omission markers, the shared 256-stage/16-MiB refresh budget and selected-detail 64-stage/16-MiB cap. They validate exact thread association before grouping or counting.

Reason, failure and gate fields contain safe recorded codes, never provider bodies or exception messages. Categories and assessment state come from the shared recorded classification and stage folding. The workspace adds no classifier, non-Pi association or coverage.

The optional `evaluatorState` on calls and selected summaries contains recorded status and a safe reason from the shared stage fold. When absent, the workspace displays the `assessmentStatus` and `failure` fields. Both adapters preserve terminal evaluator failure separately from unfinished assessment, findings, permission and execution.

## Shared layout and separate recorded detail

```text
standalone HTTP -> useArchive -> App.tsx / InspectorWorkspace -> RulePanel -> Detail
BB sidepanel -> OverviewPanel -> OverviewAdapter -> SummaryWorkspaceMount
BB main page -> OverviewPanel -------------------/          -> SummaryWorkspace
                                                              -> ThreadRuleWorkspace
                                                              -> SummaryDetail
```

The standalone app uses `useArchive` in [archive-state.ts](src/archive-state.ts) for private HTTP reads, polling and history. [App.tsx](src/App.tsx) renders its local `InspectorWorkspace`, a session-rule list and [RulePanel.tsx](src/RulePanel.tsx), with [standalone.css](src/standalone.css). It does not render `SummaryWorkspace`.

The BB thread sidepanel is registered in [app.tsx](../bb-plugin-tenet-status/app.tsx). The main-page thread overview in [main-page.tsx](../bb-plugin-tenet-status/main-page.tsx) uses the same [OverviewPanel](../bb-plugin-tenet-status/overview-panel.tsx); its project picker and dashboard are separate. [OverviewAdapter](../bb-plugin-tenet-status/overview-adapter.ts) owns safe reads, polling and selection for both overview entry points.

[SummaryWorkspace.tsx](src/shared/SummaryWorkspace.tsx) selects the BB thread-rule or call-oriented layout. [ThreadRuleWorkspace.tsx](src/shared/ThreadRuleWorkspace.tsx) owns the default thread-rule presentation; **Browse calls** opens the call-oriented variant. Both interfaces share [RuleStatus.tsx](src/shared/RuleStatus.tsx) labels, icons and semantic colours, not the standalone shell.

Standalone Detail shows named permission, tool result and assessment facts, followed by two native disclosures. **Why this assessment** contains compact recorded-rule explanations. **Recorded data** contains submitted action, policy, exact evidence/questions, response and recording details. New selections close disclosures; unchanged polls keep them mounted. The standalone UI does not fetch groups.

BB keeps [SummaryDetail.tsx](src/shared/SummaryDetail.tsx). Only the tool, recorded command or path and reported FAIL rule text stay open. **Recording details** holds assessment, mode, permission, execution, metadata and the privacy note.

The map, selected-check controls, paginated rule browser and judge fields stay collapsed. Changing a rule page preserves the whole-call result. Missing snapshots, shortened text and omitted items remain explicit.

The library entry is [library.tsx](src/shared/library.tsx). `mountSummaryWorkspace(target, input)` returns `update(input)` and asynchronous, idempotent `destroy()`. Updates after disposal do nothing. The entry exposes no raw-detail snippets, HTTP client, polling timer or global history handler.

[SummaryWorkspaceMount](../bb-plugin-tenet-status/summary-workspace.tsx) renders the shared React component directly. There is no second UI runtime or polling owner. Key the view by adapter scope when switching threads or sessions. The adapter must cancel old reads, ignore late completions and clear stale results after an unavailable read.

Embedded styles stay under `.tenet-presentation` and `.tenet-summary-workspace.embedded`. The rule-first variant shares the standalone light palette and uses BB tokens in dark mode. The call-oriented variant inherits BB theme tokens. Shared rule-status labels are scoped to `.rule-app` and `.tenet-thread-rules`.

Neither variant imports standalone document styles or opens an iframe, proxy or inspector listener. Standalone loopback, Host, Origin and frame restrictions remain unchanged.

Raw evidence remains accessible only through the [standalone inspector](../docs/inspector.md). Safe summaries still include recorded rule text. They do not guarantee confidentiality against same-user code, complete capture, live evaluator connectivity, permission or execution.
