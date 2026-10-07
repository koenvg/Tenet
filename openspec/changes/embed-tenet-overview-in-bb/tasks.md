# Tasks

Acceptance conditions remain binding in [the specification](specs/bb-tenet-overview/spec.md) and [the design](design.md). Each delivery below includes its required tests and documentation; section 6 is the broader integration check, not a substitute. Code changes require clean-context independent review and applicable project validation before acceptance. Test order is not prescribed.

Keep the existing delivery boundaries and implementation order. Complete the shared/standalone workspace and build in 3.1-3.4, 4.1 and 4.3, and the evaluator-state contract in 1.4, before accepting the initial thread-panel parts of 5.2-5.4. Complete the basic-call projection, read and initial adapter parts of 1.1-1.3, 2.1-2.3 and 4.2 with that panel before accepting rule-page integration or the main-page overview in 5.1. Complete both rule browsing and main-page browsing before accepting the live/recovery parts of 4.2 and integrated responsiveness/cleanup in 3.3; then complete 6.1-6.3.

Shared steps are complete only when all their parts have the required evidence. The change owner updates checkboxes manually from verified completion evidence. Publication alone does not prove source-task completion, integration or deployment.

## 1. Return safe archive summaries

- [ ] 1.1 Define the summary-only model and host-side allowlist projection, with documented field and omission limits. Verify with offline tests that sentinel strings in raw arguments, evidence, exact questions and provider responses cannot appear in serialized summaries, while recorded rule text remains inert.
- [ ] 1.2 Implement exact-thread-linked session and all-call pages in `ArchiveIndex`, filtering before aggregation. Verify mixed-thread native sessions, resumes, unlinked history, category overlap and 50-item page limits with offline archive fixtures.
- [ ] 1.3 Implement selected-call and 16-rule summary pages with recorded thresholds, policy identity and safe failure codes. Verify contract-version interpretation, integrity separation, oversized rule text, scoped cursors and rejected unrelated session/call identifiers without changing writer contracts.
- [ ] 1.4 Implement or reuse the recorded evaluator-state result contract through shared stage folding. Verify that the two-call provider-error fixture reports two terminal evaluator failures, no validated selected FAIL, and separate pending/dropped/cancelled and archive-warning states.

## 2. Read linked summaries through BB

- [ ] 2.1 Add strict summary owner/host RPC schemas and host handlers using the existing custom-archive settings. Verify extra-field rejection, bounded output, absent raw-source fields, retained shared parse/detail budgets and page/cursor limits through the BB SDK harness.
- [ ] 2.2 Resolve each requested Pi thread's environment and machine on the backend and validate linked record selections on the host. Verify separate local/remote identities, unsupported non-Pi requests, disconnects, archive loss and no browser-local or server-host fallback.
- [ ] 2.3 Update `bb-plugin-tenet-status/README.md` with the summary-only data contract, raw-evidence limit and exact-link behavior. Verify its links and all 18 applicable writing-guide checklist items; keep historical recording and same-user access limits accurate.

## 3. Use one summary workspace in both applications

- [ ] 3.1 Extract shared call rows, category filtering, status and rule-summary presentation behind the summary model, with adapter-owned data and navigation. Verify component fixtures for pass, selected FAIL, uncertain PASS, approval, provider failure, incomplete history and historical thresholds.
- [ ] 3.2 Connect the standalone adapter while retaining standalone action previews, Evidence, response/question inspection and recording details as private extensions. Verify existing component/browser tests and `test/standalone-workflow.test.ts`, including deep links, back/forward and unchanged access restrictions.
- [ ] 3.3 Implement container-width responsive layout and cleanup for the shared workspace. Verify Calls/Summary navigation and no horizontal overflow both at a 390-pixel browser viewport and in a 390-pixel panel inside a wide window; verify unmount stops timers/observers and stale completions cannot replace a new scope.
- [ ] 3.4 Update `docs/inspector.md` to distinguish shared BB summaries from standalone raw evidence without changing its launch instructions. Verify linked headings and the 18 applicable writing-guide checklist items.

## 4. Mount and refresh the shared workspace in BB

- [ ] 4.1 Add the Vite/Svelte summary library entry, ignored plugin-local generated output, scoped CSS and typed React mount wrapper using the existing pinned tooling. Verify a clean shared build followed by `bb plugin build bb-plugin-tenet-status`, a clear missing-artifact failure, and no dependency on a separately running inspector server.
- [ ] 4.2 Add BB adapter reads, navigation callbacks, ten-second polling, eight-second timeout and cancellation without a second polling owner. Verify React/Svelte mount disposal, live updates, preserved older pages and selected detail, cursor restart and unavailable-state clearing in frontend harness tests. For the live-browsing delivery, verify keyboard navigation, host theme isolation and closing/switching/reloading cleanup in both BB entry points before acceptance.
- [ ] 4.3 Document the combined build and local install prerequisites in the plugin README and package owner skill. Verify the commands from a clean developer copy and packaged generated assets; check the documentation guide and agent-writing instructions before changing those pages.

## 5. Browse summaries from both BB entry points

- [ ] 5.1 Replace the main navigation landing view with a paginated project/Pi-thread picker and linked-session overview. Verify meaningful root navigation, stopped-thread history, no eager multi-host archive crawl, unknown empty coverage and deep-link selection in UI tests.
- [ ] 5.2 Register the flush thread-panel overview and connect the Pi-only header action to it, preserving the neutral action, selected-FAIL indicator and focused findings route. Verify repeated opens focus the existing tab, restored non-Pi tabs read no archive, and the conversation remains visible.
- [ ] 5.3 Show the all-call timeline, shared selected summary, first-class evaluator failures and separate archive warnings in both BB entry points. Verify equivalent fixture meanings against standalone summaries and assert no Evidence/Response request or raw action preview in BB.
- [ ] 5.4 Document main-page selection, thread-panel use, refresh/retry and raw-evidence inspection on the selected machine in the plugin README and owner skill. Verify the steps against a preview, check all 18 applicable writing-guide items, and follow agent-writing instructions for the skill.

## 6. Verify the assembled BB and standalone workflow

- [ ] 6.1 Run the complete affected application sequence in `CONTRIBUTING.md`: SDK and inspector builds, isolated serial Bun suite, application type check, inspector check and both browser suites, then plugin types/tests and the shared/plugin builds. Verify zero exits and report any skipped checks; use no TypeSafe credentials for offline tests.
- [ ] 6.2 Capture and inspect representative desktop, compact and narrow-panel BB previews using synthetic fixtures, including host disconnect and provider failure. Verify keyboard reachability, readable statuses, host theme isolation, unchanged standalone evidence access and no horizontal overflow; make no live install/reload or evaluator call without new operator authorization.
- [ ] 6.3 Run the single read-only completion review required by the implement workflow against the complete implementation diff and its pre-implementation commit. Resolve blocking findings, rerun affected checks, and report any unverified deployed remote-host or live-evaluator behavior rather than treating simulated coverage as proof.
