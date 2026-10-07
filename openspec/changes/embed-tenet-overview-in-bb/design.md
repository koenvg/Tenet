# Design

## Context

See [the proposal](proposal.md) for the purpose and [the overview spec](specs/bb-tenet-overview/spec.md) for the required behavior.

The current plugin registers a Pi-only header action and a `findings` navigation page. `DetailsPage` lists selected FAIL calls only; its root route contains instructions rather than an overview. The backend resolves each requested thread through BB's SDK and reads its archive through a host entry. Existing detail responses deliberately exclude raw actions and evidence.

The standalone inspector uses Svelte 5 and Vite. Its `App.svelte` owns HTTP reads, browser history, polling and selection. `Detail.svelte` and `DecisionSummary.svelte` consume the full `InvocationView`; the latter derives action previews from submitted arguments. Mounting those views unchanged inside BB would violate the summary-only contract. BB's plugin registrations are React modules.

The standalone listener binds to loopback, rejects different Host and Origin headers, and sets `frame-ancestors 'none'`. The approved live probe produced two linked calls with terminal `provider-error` assessments. BB reduced those failures to incomplete counts. The recorded cause was not diagnosed further; layout changes must not claim to repair connectivity.

`bb-pi-thread-rule-status` is still an in-flight spec, although its plugin code is present. This change adds `bb-tenet-overview` without editing that historical proposal or pretending it is already a durable capability.

## Goals / Non-Goals

**Goals:**

- Put the shared call-list and summary behavior behind one small module interface with two real adapters: standalone HTTP and BB host RPC.
- Apply the summary-only privacy contract before serialization, not through a hidden tab or client-side field removal.
- Make each route and continuation token select an exact thread, session and call, including when native session identifiers overlap.
- Keep BB's panel ownership and the standalone inspector's lifecycle and security rules intact.

**Non-Goals:**

- Full `InvocationView` transport to BB, an evidence viewer in BB, or a loopback-server proxy.
- A new evaluator, archive migration, recording writer change, approval control or provider-connectivity repair.
- Retrofitting unlinked history, browsing non-Pi BB threads, or eager assessment-status scans across every machine in a project.
- Reimplementing the inspector in React or introducing a general-purpose application embedding framework.

## Decisions

### 1. A summary workspace with two adapters

Extract a shared summary workspace from the existing inspector rather than copying its complete application into the plugin. Its interface covers session and call pages, selected-call rule summaries, selection, loading/error states, and navigation callbacks. Its input model contains no raw evidence, arguments, exact question payloads or provider responses. Each adapter owns its transport, scope and navigation integration.

The standalone adapter derives this summary model from local reader results. Its existing evidence, action previews and recording-detail views remain standalone-only extensions around the shared summary. The standalone app keeps its current previews without passing their source fields through the BB summary interface. The BB adapter accepts the same summary model from strict owner RPC schemas. BB shows tool and call labels, not command/file previews. It explains that raw evidence remains in the standalone inspector on the selected machine.

Share presentation for call rows, category labels, summary statuses and rule summaries. Reuse `finding-triage` and recorded stage folding for classification. Do not create a second outcome classifier in the workspace or convert incomplete history into a guessed assessment.

Rejected alternatives: importing `App.svelte` unchanged mixes BB routing with `/api/sessions` fetches and full evidence; copying its UI to React creates two implementations; hiding Evidence alone still transfers sensitive fields.

### 2. Compile shared Svelte views for the React plugin registration

Keep React for BB registration and mount the shared Svelte workspace in a small React-owned container. Use the existing Svelte/Vite tooling to produce a library entry with its runtime and scoped styles. Place generated output in an ignored plugin-local directory separate from `dist`, then let `bb plugin build` consume that local entry and its CSS.

The wrapper supplies typed adapter callbacks and updates selection through the shared interface. It destroys the Svelte instance on unmount or reload. Build the shared entry before the plugin bundle; fail visibly when it is missing rather than loading a stale compiled copy. Document the combined build command and use it in verification.

Rejected alternatives: changing BB's frontend compiler or adding a second UI framework rewrite expands the scope. An iframe would require changing the standalone access rules and would point at the wrong machine for remote threads.

### 3. A main overview and a thread panel using the same workspace

Replace the navigation root with a project and paginated Pi-thread picker based on BB's SDK metadata. Read archive status only for the selected thread; the root does not crawl every host. The selected-thread page lists exact linked sessions and opens the workspace for one session and call. Keep the existing navigation path `findings`: its root becomes the picker, new `overview/<threadId>` subpaths with optional opaque session/call suffixes select summaries, and existing `<threadId>` subpaths retain focused flagged-rule links.

Register a `threadPanelAction` with `layout: 'flush'` and open it from the existing Pi-only header action through BB navigation. Repeated opens focus the existing panel tab. Keep the conversation in place and keep the neutral header action and selected-FAIL count. Retain the existing flagged-rule route/action for focused findings; both routes use the same safe projection and classification work.

The current panel slot has no provider-filter field. Guard its activation and restored view by resolving the thread provider. Non-Pi targets show an unsupported state and make no archive request; the header and main picker remain Pi-only. Do not modify BB's tab strip, resizing, drawer, Browser or Terminal behavior.

At wide sizes, show the call list beside the selected summary. At compact widths, use Calls and Summary views; keep coverage status and refresh reachable. Base this layout on the workspace container width, not the browser viewport, so a narrow thread panel works inside a wide BB window. The main page additionally provides project/thread/session selection. Scope styles to the workspace and use host theme tokens in BB so standalone styles do not affect the shell.

Rejected alternative: only a main page forces owners to leave the conversation; only a side panel provides no project/thread entry point.

### 4. Project safe summaries on the selected host

Extend `ArchiveIndex` with exact-thread-linked session pages, call pages and a selected-call summary. These operations filter records by BB thread association before grouping or counting. Existing `sessions`, `invocations` and `uncertaintyGroups` operations are not safe substitutes: a native session can contain records from more than one BB thread.

The backend always resolves `threadId` to its provider, environment and host through BB. Only owner settings can supply a custom archive directory. Requests accept bounded identifiers and cursors, never a machine ID, filesystem path or arbitrary native session selector. Validate requested opaque session and invocation IDs against the selected thread before returning data or using a detail reader. Bind cursors to operation, thread, selected session and category; rule cursors also bind the selected invocation and recorded snapshot.

Construct a strict summary object on the host using an explicit field allowlist. Include opaque record IDs, bounded tool/call labels, timestamps, recorded mode, assessment status and safe failure codes, category tags/counts, recorded decision/permission/execution, coverage codes and bounded rule summaries. Rule summaries may contain recorded policy text, selected outcomes/confidence, effective thresholds and known gate codes. Do not serialize `InvocationView` and then remove fields. Policy text already appears in the plugin and can itself contain secrets; summary-only access is not a confidentiality guarantee against same-user code or an owner client.

Use 50-item session/call pages and 16-rule pages. Keep cursors at 512 characters, labels at 256 characters, rule text at 2,048 characters and issue lists at 20 codes. Preserve explicit omission markers. Preserve the shared per-refresh 256-stage/16-MiB parse budget and selected-detail 64-stage/16-MiB cap; do not multiply the scan budget per row. Do not read full details for every call in a timeline page.

Rejected alternative: copying archives to BB server storage increases disclosure and duplicates retained evidence; returning an entire archive-wide session list can mix thread identities.

### 5. Show recorded operational failure as a first-class result

Use the shared recorded classification to distinguish pending, completed, unavailable, dropped and cancelled assessment states. Expose only safe allowlisted reason codes, such as `provider-error`, not provider bodies or exception messages. Keep category overlap and distinct-call counts. Keep archive-wide warnings separate from selected-thread assessment failures.

Coordinate the recorded evaluator-state result contract with this contract work and reuse its implementation if it lands first. This planning artifact does not authorize implementation; keep one failure mapping. A new overview must state that the two live-probe assessments failed, even though the tools completed and no validated FAIL finding exists.

Rejected alternative: retaining only `incomplete` is safe against a false pass but does not tell the owner why no valid policy result exists.

### 6. Keep refresh and navigation under the adapter's owner

The BB adapter uses `toPluginPanel` for main-page history and persistent JSON panel parameters for the thread tab. Routes contain only bounded thread and opaque session/call identifiers. It does not clear BB's query string or install an independent global history handler. The standalone adapter preserves the inspector's existing links and back/forward behavior.

Use the existing BB ten-second polling interval and eight-second read timeout. Preserve loaded older pages and selected detail; refresh restarts pagination. Limit each workspace to one read cycle at a time, cancel on scope changes, and ignore stale completions. A disconnected host, timeout or lost archive clears available results and offers retry rather than keeping a stale clean-looking result. A rejected cursor offers a page-one refresh.

Rejected alternative: letting both the React wrapper and Svelte workspace poll independently duplicates host reads and makes cleanup harder.

## Risks / Trade-offs

- Shared-view extraction can change standalone evidence behavior. Mitigation: keep raw-detail extensions separate and run the existing standalone component, browser and Pi-launch tests.
- Summaries can leak action strings through convenience helpers. Mitigation: construct strict host-side projections and test sentinel strings in arguments, evidence and provider responses against serialized RPC output and rendered BB views.
- Archive warnings can hide a selected-thread failure. Mitigation: display evaluator state prominently and label global coverage warnings separately.
- Svelte runtime and CSS can affect BB bundle size or styling. Mitigation: build a summary-only entry, scope styles, test host themes and dispose each mounted instance.
- Unbounded rule sets or mixed-thread native sessions can bypass detail limits. Mitigation: exact-link filtering, scoped cursors, explicit omission counts and hostile-selection tests.
- The live evaluator remains unavailable until separately diagnosed. Mitigation: use scripted fixtures for deterministic acceptance and report real provider errors honestly; offline success is not live connectivity proof.

## Migration Plan

1. Add the safe projection and exact-linked reader operations with offline tests. Reuse the recorded evaluator-state result contract instead of duplicating it.
2. Extract the shared summary workspace and keep the standalone adapter and evidence views working before adding BB registration.
3. Add the shared library build, BB adapter, main overview and thread panel. Preserve the existing findings route and settings.
4. Run affected-system verification from `CONTRIBUTING.md`, build the plugin, and compare desktop and compact previews before a live install. Check the package's shipped raw-evidence limits and update its owner instructions.
5. Any installation/reload or further live assessment needs operator authorization for that action. The authorization for the previous two-call probe does not permit a new provider run. Verify an enrolled remote host separately; a simulated host test is not that proof.
6. Roll back by rebuilding/reloading the prior plugin generation and reverting the shared-view change if needed. No archive rewrite, policy change or standalone access-rule change is required. Preserve recorded contract versions and existing links.
