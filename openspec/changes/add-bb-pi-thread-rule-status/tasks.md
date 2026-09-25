# Tasks

## 1. Recording association

- [ ] 1.1 Add optional, validated `bbThreadId` to new Pi archive envelopes from `BB_THREAD_ID`; verify tests cover absent/invalid IDs, legacy version-1 and version-2 records, and unchanged session directory keys.
- [ ] 1.2 Bind the BB ID to individual invocations without changing the judge, permissions, capture opt-out or Pi inspector output; verify `bun test` cases for resumed and forked threads, independent Pi sessions, and recording failures.
- [ ] 1.3 Document the optional BB association and its historical-record limitation in the TENET README; verify the text does not claim that BB enables assessment or recovers unlinked records.

## 2. Bounded read-only projection

- [ ] 2.1 Extend the validated archive index with scoped `(host machine, bbThreadId)` summaries and an on-demand bounded detail projection; verify fixtures for BLOCK, WARN, integrity, selected low-confidence FAIL, ASK, UNKNOWN, missing stages and capture loss without using the decision's BLOCK count as a failure count.
- [ ] 2.2 Keep raw requests/responses, action strings and provider prose out of summary and detail results; verify synthetic secret-bearing records, unsafe/symlink archive paths, corrupt files, indexing limits and stable pagination against the reader tests.
- [ ] 2.3 Document the projection's status meanings and scan limits beside the reader contract; verify absent records and read failures return unknown/unavailable rather than a passing thread status.

## 3. BB host and backend integration

- [ ] 3.1 Scaffold the package-layout BB plugin with `bb plugin new`, add an explicit reusable reader dependency/bundle and current SDK types; verify package installation, `bb plugin types --check`, and `bb plugin build` without depending on Pi startup.
- [ ] 3.2 Add a read-only host entry that locates the default archive or a configured absolute per-host path and returns only bounded projections; verify host-entry tests for private files, wrong paths, unavailable hosts and two hosts with overlapping Pi session IDs.
- [ ] 3.3 Add strict BB RPC that resolves provider and machine from `bb.sdk.threads.get` before calling the host entry; verify SDK harness tests reject non-Pi, unknown and cross-host thread requests and never accept client-supplied filesystem paths or host IDs.
- [ ] 3.4 Document plugin installation, custom per-host archive paths and the need to enable TENET recording separately in the plugin's own `skills/` documentation; verify the documented path-install and status commands work as written.

## 4. Quiet thread UI

- [ ] 4.1 Add a Pi-only thread panel action and conditional compact header indicator; verify frontend tests show no indicator on passes, ASK, UNKNOWN or absent records and show one for a validated FAIL without a toast or agent-visible output.
- [ ] 4.2 Render grouped rule findings with call identities, rule text, severity, confidence, mode, would-decision, permission and observed execution, plus separate approval/coverage states; verify component tests for repeated rules, inert malicious text, incomplete indexing, unknown execution and accessible labels.
- [ ] 4.3 Refresh and clean up thread-scoped reads on new records, panel close and plugin reload; verify tests prevent stale host data from appearing in another thread and README instructions describe what a blank indicator does and does not mean.

## 5. Integration checks

- [ ] 5.1 Run focused archive and BB plugin tests, the TENET Bun suite/typecheck and `bb plugin build`; verify zero regressions and that the shared reader works in the built host artifact.
- [ ] 5.2 Install or reload the BB plugin in a test/live BB environment and exercise a synthetic recorded Pi thread and one without linked records, including a host-read failure; verify read-only UI behavior and report any remote-host or visual check that could not be completed.
