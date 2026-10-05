# Build and use the shared summary workspace

Use this developer-checkout reference to build the Svelte summary library and mount it from React. The mount is prepared for BB, but this slice registers no overview page, panel or RPC. The existing standalone inspector and flagged-rule plugin remain the user entry points.

## Build the library and plugin

Use Bun 1.3.14+, Node 22.19+, the [locked development dependencies](../CONTRIBUTING.md#set-up) and an installed BB CLI for plugin builds. Keep `TYPESAFE_API_KEY` unset for offline checks. Do not use real archives in previews. Recorded rule text can contain secrets even when the summary excludes evidence.

1. From the repository root, build both local outputs:

   ```sh
   bun run plugin:build
   ```

   This rebuilds the Svelte library, its bundled runtime, scoped CSS and TypeScript declarations in ignored `bb-plugin-tenet-status/.summary-workspace/`. It then runs `npm run build` in the plugin directory. Nothing is installed or reloaded.

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

## Summary input

The source contract is [shared/model.ts](src/shared/model.ts). It is a presentation contract, not the authenticated BB transport schema. Future BB host adapters must construct an allowlisted, validated summary before serialization. TypeScript types alone do not enforce a privacy boundary.

`SummaryWorkspaceInput` has two fields:

- `model` holds the loaded call page, selected summary, selected opaque ID, category, coverage, loading/error state and optional continuation flags.
- `actions` holds selection, category, refresh and optional call/rule continuation callbacks. The adapter owns session selection, pages, transport, polling, cancellation and routing.

`SummaryCall` has an opaque ID, call/tool labels, timestamp, mode, recorded decision, permission, execution, categories, missing-stage codes, assessment status and safe failure code.

`SummaryDecision` has call/tool identity and mode, those recorded facts, approval, recorded reason code, the recorded no-violation flag and rules. It has no action, evidence, question or provider-response field.

`SummaryRule` has recorded ID, inert text, line, `enforcement` severity, built-in identity, selected outcome/evidence scores and probabilities, gates, contribution, effective thresholds, evidence-gate status and assessment profile. Nullable scores, thresholds and gates remain unknown. The view never compares current policy or recomputes classifications.

For BB transport, the approved limits are 50 sessions/calls per page, 16 rules per page, 512-character cursors, 256-character labels, 2,048-character rule text and 20 issue codes. Host adapters must preserve explicit text/page omission markers and existing parse/detail budgets. This presentation slice does not implement those host reads or authenticate record association.

Reason, failure and gate fields must contain safe recorded codes, never provider bodies or exception messages. Categories and assessment state come from existing recorded helpers. TENET-43 owns evaluator-failure classification; integrate its recorded result into these fields rather than adding a classifier here. No non-Pi association or coverage is added.

The optional `evaluatorState` on calls and selected summaries accepts the TENET-43 shared-fold shape, with recorded status and safe reason. When absent, the workspace displays the current `assessmentStatus` and `failure` fields. The standalone projection copies this field when its reader provides it. Reader propagation and the BB status commit must be integrated separately; this slice does not merge TENET-43.

## Two adapters, one presentation

```text
standalone HTTP -> explicit summary projection -> shared Svelte workspace
                  standalone-only snippets   -> raw detail views

planned BB host RPC     -> validated safe summary     -> React mount -> same workspace
```

The standalone app uses [standalone-adapter.ts](src/shared/standalone-adapter.ts) and the shared call, status and rule views. Its private snippets keep action previews, assessment-map interactions, Evidence, exact questions, Response, Policy, recording details and uncertainty groups outside the summary model. Existing session links, history and polling stay in the standalone app.

The library entry is [library.svelte.ts](src/shared/library.svelte.ts). `mountSummaryWorkspace(target, input)` returns `update(input)` and asynchronous, idempotent `destroy()`. Updates after disposal do nothing. The entry exposes no raw-detail snippets, HTTP client, polling timer or global history handler.

[SummaryWorkspaceMount](../bb-plugin-tenet-status/summary-workspace.tsx) is the typed React wrapper. It mounts once, updates the same Svelte instance for new input and destroys it on unmount. Key the wrapper by adapter scope when switching threads or sessions. The adapter must cancel old reads, ignore late completions and clear stale results after an unavailable read.

Styles stay under `.tenet-summary-workspace.embedded` or Svelte-generated component selectors. They inherit BB theme tokens and do not import standalone document styles. The library opens no iframe, proxy or inspector listener. Standalone loopback, Host, Origin and frame restrictions remain unchanged.

Raw evidence remains accessible only through the [standalone inspector](../docs/inspector.md). Safe summaries still include recorded rule text. They do not guarantee confidentiality against same-user code, complete capture, live evaluator connectivity, permission or execution.
