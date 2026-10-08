# Build and use the shared summary workspace

Use this developer-checkout reference to build the shared React summary library. The standalone inspector and both BB overview entry points use this workspace. See [the BB overview guide](../bb-plugin-tenet-status/README.md) for main-page selection, the thread panel and safe host reads.

## Build the library and plugin

Use Bun 1.3.14+, Node 22.19+, the [locked development dependencies](../CONTRIBUTING.md#set-up) and an installed BB CLI for plugin builds. Keep `TYPESAFE_API_KEY` unset for offline checks. Do not use real archives in previews. Recorded rule text can contain secrets even when the summary excludes evidence.

1. From the repository root, build both local outputs:

   ```sh
   bun run plugin:build
   ```

   This rebuilds the React library, scoped CSS and TypeScript declarations in ignored `bb-plugin-tenet-status/.summary-workspace/`. React stays external so the standalone app and BB each use their own existing React runtime. The command then runs `npm run build` in the plugin directory. Nothing is installed or reloaded.

2. Check the library and React adapter:

   ```sh
   bun run inspector:check
   CI=1 bun run inspector:test:components
   cd bb-plugin-tenet-status
   ./node_modules/.bin/tsc --noEmit
   ./node_modules/.bin/vitest run --config vitest.config.ts
   cd ..
   ```

Success means each command exits zero. A missing or stale library stops the plugin build with `bun run summary:build` as the fix. Run that command from the root before importing the wrapper. The build stamp checks source content, not file modification times. Use the [full offline verification order](../CONTRIBUTING.md#check-a-change) for application and standalone workflow checks.

## Preview safe synthetic data

This source-only preview uses authored summaries. It reads no archive, sends no evidence, starts no standalone inspector listener and calls no evaluator. It is not a running-BB or remote-host acceptance check.

1. From the repository root, start Vite:

   ```sh
   bun run summary:preview --port 52351
   ```

2. Open `http://127.0.0.1:52351/summary-preview.html`. Add `?container=390` for a 390px workspace inside a wide window. Also test a 390px browser viewport.
3. Use Calls and Summary at compact widths. Coverage and Refresh archive remain outside these views. Stop Vite with Ctrl+C when finished.

The list and summary appear beside each other above a 650px workspace width. The compact navigation uses the workspace container width, not the window width. If port 52351 is occupied, use the URL Vite prints.

Open `http://127.0.0.1:52351/comparison-preview.html` for the common-summary-only comparison. Both adapters receive the same authored fixture, selection and category filter. Summary disclosures and compact navigation stay synchronized when you use either side.

Add `?container=390` to compare 390px containers inside a wide window. Check that shared fields have the same content, order and positions, not only that they fit. The preview starts without raw extensions, so omitted raw content cannot change the common layout.

Select **Show standalone-only inspection**, or add `?raw=1`, to show Recorded data after the left summary. Submitted action, captured policy, exact questions, evidence, response and recording details stay in that private section; BB receives no raw values. The left workspace can become taller; its common summary rows retain their positions.

## Summary input

The source contract is [shared/model.ts](src/shared/model.ts). It is a presentation contract, not the authenticated BB transport schema. BB host adapters construct an allowlisted, validated summary before serialization. TypeScript types alone do not enforce a privacy boundary.

`SummaryWorkspaceInput` has two fields:

- `model` holds the loaded call page, selected summary, selected opaque ID, category, coverage, loading/error state and optional continuation flags.
- `actions` holds selection, category, refresh and optional call/rule continuation callbacks. The adapter owns session selection, pages, transport, polling, cancellation and routing.

`SummaryCall` has an opaque ID, call/tool labels, timestamp, mode, recorded decision, permission, execution, categories, missing-stage codes, assessment status and safe failure code.

`SummaryDecision` has call/tool identity and mode, those recorded facts, approval, recorded reason code, the recorded no-violation flag and rules. It has no action, evidence, question or provider-response field.

The optional `explanation` holds whole-call blocking facts: blocker count, whether all recorded blocking gates are uncertainty gates, and the first blocker's built-in identity, line, gate, scores and thresholds. Paginated HOST summaries require this strict, bounded context.

Both adapters derive it from the complete snapshot through `summarizeBlockingRules`; changing the inspected rule page cannot change the call explanation. It contains no rule text or raw payload.

`SummaryRule` has recorded ID, inert text, line, `enforcement` severity, built-in identity, selected outcome/evidence scores and probabilities, gates, contribution, effective thresholds, evidence-gate status and assessment profile. The optional recorded source origin retains role, path, target, digest and line; BB bounds its labels to 256 characters. Nullable scores, thresholds and gates remain unknown. The view never compares current policy or recomputes classifications.

BB transport limits are 50 sessions/calls per page, 16 rules per page, 512-character cursors, 256-character labels, 2,048-character rule text and 20 issue codes. Host reads preserve explicit text/page omission markers, the shared 256-stage/16-MiB refresh budget and selected-detail 64-stage/16-MiB cap. They validate exact thread association before grouping or counting.

Reason, failure and gate fields contain safe recorded codes, never provider bodies or exception messages. Categories and assessment state come from the shared recorded classification and stage folding. The workspace adds no classifier, non-Pi association or coverage.

The optional `evaluatorState` on calls and selected summaries contains recorded status and a safe reason from the shared stage fold. When absent, the workspace displays the `assessmentStatus` and `failure` fields. Both adapters preserve terminal evaluator failure separately from unfinished assessment, findings, permission and execution.

## Shared layout and separate recorded detail

```text
standalone HTTP -> archive-state.ts -> shared workspace layout
                                     -> private call rows and Detail.tsx

BB host RPC -> validated safe summary -> React mount -> shared workspace
                                                     -> SummaryDetail.tsx
```

The standalone app uses `useArchive` in [archive-state.ts](src/archive-state.ts) for its loader, polling and history. [SummaryWorkspace.tsx](src/shared/SummaryWorkspace.tsx) owns the shared pane layout and resizer. Internal render slots keep private command/file rows and [Detail.tsx](src/Detail.tsx) out of the public summary input.

Standalone Detail shows named permission, tool result and assessment facts, followed by two native disclosures. **Why this assessment** contains compact recorded-rule explanations. **Recorded data** contains submitted action, policy, exact evidence/questions, response and recording details. New selections close disclosures; unchanged polls keep them mounted. The standalone UI does not fetch groups.

BB keeps [SummaryDetail.tsx](src/shared/SummaryDetail.tsx), its recorded map, selected-check controls and paginated rule summaries. Those components still use [presentation.css](src/shared/presentation.css). The synthetic comparison also renders this safe summary on both sides; it is not proof of the private Inspector's layout.

The library entry is [library.tsx](src/shared/library.tsx). `mountSummaryWorkspace(target, input)` returns `update(input)` and asynchronous, idempotent `destroy()`. Updates after disposal do nothing. The entry exposes no raw-detail snippets, HTTP client, polling timer or global history handler.

[SummaryWorkspaceMount](../bb-plugin-tenet-status/summary-workspace.tsx) renders the shared React component directly. There is no second UI runtime or polling owner. Key the view by adapter scope when switching threads or sessions. The adapter must cancel old reads, ignore late completions and clear stale results after an unavailable read.

Embedded styles stay under `.tenet-presentation` and `.tenet-summary-workspace.embedded`. They inherit BB theme tokens and do not import standalone document styles. Shared status chips also support the private `.standalone-inspector` scope. The library opens no iframe, proxy or inspector listener. Standalone loopback, Host, Origin and frame restrictions remain unchanged.

Raw evidence remains accessible only through the [standalone inspector](../docs/inspector.md). Safe summaries still include recorded rule text. They do not guarantee confidentiality against same-user code, complete capture, live evaluator connectivity, permission or execution.
