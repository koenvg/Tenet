# TENET-8 validation

Baseline: `0c59226ce3d4151ddbbbb2f5fdb5008f0100bb33`.

## Implemented

- Ten-second status polling while the Pi header is mounted, including when closed. A count appears only for recorded validated selected FAIL calls.
- Selected FAILs remain distinct from approvals, UNKNOWN, evidence/confidence gates and incomplete assessment notices.
- Loaded findings group by rule ID and recorded policy-snapshot hash. WARN, built-in integrity, confidence and uncertainty are visible.
- Detail polling preserves the selected thread. Eight-second read deadlines, cleanup and late-response guards prevent stale results after failed reads or navigation.
- Missing configured archives report unavailable rather than an empty successful read. Actual host selection and per-machine custom archive settings remain owner-controlled.
- SDK declarations updated from 0.5.9 to the installed 0.5.29.

## Automated checks

- `bun run inspector:build`: passed.
- `TMPDIR=/private/tmp bun test --isolate --max-concurrency=1 --timeout=30000`: 387 passed, zero failures after review fixes.
- `bun run typecheck`: passed.
- `bun run inspector:check`: zero errors and warnings.
- Plugin `npx tsc --noEmit`: passed.
- Plugin `npx vitest run --config vitest.config.ts`: 17 passed after the owner-requested layout refinement.
- `bb plugin build bb-plugin-tenet-status`: passed for server, app and host bundles.

The short TMPDIR avoids macOS Unix-socket path limits in existing Claude tests. Building inspector assets and using the documented isolated runner resolved initial regression-run failures.

The routing integration test uses real archive files and SDK host/RPC schemas with simulated local and remote machine identities. It covers new records, different custom archive roots, host disconnect, archive deletion, WARN, integrity, low-confidence FAIL, policy snapshot changes and action/evidence exclusion. It does not deploy a second machine.

## Completion review fixes

1. Missing decisions or missing per-rule diagnostics now keep a selected FAIL visibly uncertain, even at 99% confidence. The projection reuses the canonical folded uncertainty classification instead of copying gate names. New missing-decision/per-rule tests failed before the fix and now pass.
2. Once older pages are loaded, polling checks availability without discarding those calls. A visible message directs the owner to Refresh for updated calls. An unavailable read still clears them. A pagination-across-poll test failed before the fix and now passes.
3. The integration fixture now writes schema-valid request records with model, state, questions, mapping and question version. The test validates the actual archived request, confirms evidence was recorded, and rejects unexpected corrupt-record gaps before checking the owner projection excludes evidence.

## Live Browser Use verification

Browser Use connected to the existing Arc session through port 9222. Tested the actual BB app and installed build on local host `host_dt6w76k4w8`, using this Pi thread and a disposable custom archive. No mock browser RPC handlers were used.

- With no linked records, the popover showed unknown coverage and no count.
- A single synthetic PASS produced no indicator and explicitly avoided an all-clear.
- Appending synthetic FAIL records updated the closed header to seven flagged calls without opening the popover or changing the thread route.
- Details grouped repeated calls under the recorded policy snapshot. WARN, built-in integrity and 60% uncertain FAIL were visible. Approval conditions and recording gaps remained separate.
- The fixture produced capture-loss and missing-stage notices. They were shown separately, not as extra rule failures.
- Loading older findings produced seven occurrence rows. All seven remained after a measured 12-second interval, with the same selected thread and a visible Refresh instruction.
- Neither synthetic action nor evidence sentinels appeared in the details DOM.
- Moving the custom archive away caused the live details page to show unavailable and remove all occurrence rows. The thread header also removed its count. Restoring the archive recovered the count.
- Inspected screenshots at desktop and 390px width. Compact content stayed within the viewport; the popover spanned x=8 to x=382. Escape closed the popover.

Screenshots attached to TENET-8: `tenet8-live-compact-summary.png`, `tenet8-live-compact-details.png`, and `tenet8-live-archive-loss.png`.

Cleanup restored `recordingDirectories` to `{}`, cleared device emulation, and closed only the test tab and Browser Use session. The tested plugin remains installed from this worktree: restoring the previous source failed because that older worktree no longer contains its package. No real TENET archive was changed.

## Owner-requested layout refinement

The follow-up request was to make the BB view easier to scan and hide secondary information. This is a new UI refinement, not another pass on the original backend review.

- One collapsed row per recorded rule/snapshot, with a flag or integrity icon, loaded-call count, and visible uncertainty.
- Call IDs, confidence percentages and snapshot hashes are revealed by opening a rule.
- Coverage qualification remains visible. Approval counts and recording gaps lead to one disclosure containing the mechanics.
- The popover has one primary View flagged rules action. At a 390px viewport width, its height decreased from about 271px to 195px in the same fixture.
- Native details/summary controls work with Enter and retain their open state during polling, covered by UI tests.
- Arc screenshots inspected at desktop and 390px width. No horizontal overflow; body text uses the host foreground with a measured 6.10:1 contrast on the active light theme.
- Impeccable mechanical detector reported no findings. 387 regressions, 17 UI tests, TypeScript and plugin builds pass.

Screenshots: `tenet8-layout-desktop.png`, `tenet8-layout-mobile.png`, `tenet8-layout-popover.png`. Temporary archive settings and viewport emulation were restored, and the test tab was closed. The refined build is installed.

The single fresh-context layout review found one P2 accessibility regression: the primary action's old aria-label overrode its new visible label. Removed the redundant aria-label so the accessible name is View flagged rules. The updated accessible-role test failed before the fix and passed afterward. All 17 UI tests, plugin TypeScript and the plugin build passed again; the fixed build was reloaded. No second layout review was launched.

The later plain-English pass changed UI copy only. For example, Incomplete coverage became Some calls may be missing, WARN became Warning, and Built-in integrity became Rule protection. Call counts now say calls shown. Technical explanations were shortened; actual rule text, grouping, polling and decision data were not changed. All 17 UI tests, plugin TypeScript and the build passed again, and the build was reloaded.

## Recorder upgrade and empty-state correction

The owner reported an empty current-thread page with three recording warnings. Pi still loaded `/Users/koen/workspace/Tenet` at clean commit `0259d06`, which writes schema 2 without BB thread links. The status plugin used this task worktree and requires schema 3 with an exact thread link. The synthetic tests had not verified that installed-recorder pairing.

With owner approval, changed only the TENET package source in `~/.pi/agent/settings.json` to this worktree. Verified all other settings are equal to the backup at `/private/tmp/tenet8-pi-settings-before-update.json`. No activation, enforcement mode, policy or old recording was edited. Retain this worktree while Pi and the BB plugin reference it. The main Pi session still needs a restart to load the newly selected extension.

The empty state now says no recordings are linked and rule status is unknown. Shared archive warnings are collapsed, explicitly may include other threads, and no longer carry a misleading count. Zero-call views omit flag explanations and saved-call totals. Unfinished recordings are no longer described as currently being written.

Verification: 387 Bun tests, 18 UI tests, both TypeScript checks and the plugin build passed. The new empty-state regression failed before the fix. A single fresh-context completion review approved the correction with one P3 count-label finding. Fixed it and added a paginated UI assertion distinguishing nine linked calls from one then two displayed findings; it failed before the fix and all 18 UI tests passed afterward. Plugin TypeScript and build passed again, and the plugin was reloaded. Review report: `tenet8-recorder-empty-review.md`. No second review was launched.

Checked the actual thread in Arc, without synthetic archives. During this check, fresh processes had started writing schema-3 records carrying this thread ID, and the real status popover showed 13 linked calls. This does not prove the existing main Pi process has reloaded. At 390px the details page kept archive warnings collapsed with no horizontal overflow. Screenshot: `tenet8-archive-warnings-mobile.png`. Cleared emulation and closed only the verification tab. After the main Pi restart, verify another eligible invocation before claiming its full recording path is recovered.

## Main-thread restart verified

On the owner's request, scheduled a continuation in this same thread and called `bb thread stop --self` to release the Pi runtime without clearing history. The continuation resumed successfully. Read-only verification calls now produce schema-3 records with host `pi`, BB thread `thr_33jvazv2k2`, and native session `01a0e2cd-764f-7482-ab2c-21f76d7e9721`. This differs from the review worker's native session `01a0e525-418f-762a-85cd-92013a7bccd2`. Fresh `ctx_execute` begin records track this resumed main turn; that tool was not in the review worker's tool set. Inspected archive metadata only, not submitted evidence.

Opened the actual thread in Arc again. Its TENET status now showed 19 recorded calls, no flagged calls, visible incomplete coverage, and collapsed archive warnings. No synthetic archive or rule was used. The main-recorder restart gate is resolved; this is not an all-clear or a waiver of the remaining validation below.

## Remaining validation

- Only `host_dt6w76k4w8`, the local Mac, is enrolled. A real remote-host end-to-end check needs a connected enrolled remote host.
- Arc connection and live BB UI verification are now complete through Browser Use. The earlier direct Playwright connection failure is no longer a blocker.
- `CI=1 bun run inspector:test` was not run because its configured browser launches need approval under the owner's browser preference. Inspector source UI was not changed.
- The single fresh-context review returned request changes. All three code/test findings were fixed and their regressions pass. No second reviewer was launched.

Do not mark the task done until these gates are resolved or explicitly waived by the owner.
