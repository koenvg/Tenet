# KVG-5215 completion review

Verdict: **Request changes.** Two responsive-layout defects block approval. Both follow directly from the CSS cascade; they are not claims based on screenshots or a browser run.

Reviewed the working tree against `02b1b55866406d4bd0c92ed1a17fee2424bc5b07`, including the untracked map projection, font/license, design records and approved map/Focus references. The Focus sidebar supersedes horizontal navigation.

## Findings

### 1. P1: Remove competing layout ownership before changing the mobile breakpoint

Location: `inspector/src/summary.css:20–45,128–143`, interacting with `inspector/src/style.css:141–147`.

`main.ts` imports both stylesheets. The original stylesheet still switches to mobile grid placement at 1100px: both `.explorer` and `.inspection` occupy row 3, column 1. The redesign reinstates three desktop columns and makes both panes visible, but only switches to its flex/mobile layout at 900px. It never restores the desktop grid positions or row template between those breakpoints.

At a 1024px viewport, both visible panes therefore occupy the same 300px-wide first column. The later inspection element paints over the call explorer, while the remaining main-workspace column is unused. The divider also retains its old row-2 placement. This breaks the required side-by-side sidebar and map on ordinary tablet/small-window widths.

Do not add another layer of specificity patches. Give the workspace one canonical set of grid placements and one mobile breakpoint, removing the superseded layout declarations from the other stylesheet. Add coverage at 901, 1024 and 1100px asserting nonoverlapping pane bounds and a full-height divider. Existing browser coverage jumps from mobile widths through 768px to desktop widths starting at 1440px, missing this interval.

### 2. P2: Clear desktop offsets when stacking check nodes

Location: `inspector/src/summary.css:147–159`, especially line 158, interacting with line 68.

The narrow-container rule initially makes `.map-check` static, but then changes it to `position: relative` for the branch pseudo-element. Its desktop `left: 47.1%` and `top: calc(var(--node-y) - …)` remain in force. `position: relative` does not discard those offsets.

Consequently, every stacked check shifts right by almost half its containing block while retaining its full normal-flow width. Captions/meters can extend beyond the workspace, and branch stubs no longer meet the vertical branch line. This affects mobile and desktop windows whose resized workspace falls below 850px.

Reset the node insets in stacked mode, or scope desktop absolute positioning and offsets exclusively to the wide layout. Verify check bounds and branch alignment at 320/390/768px and after sidebar resizing. Assert the invocation scroller's own `scrollWidth <= clientWidth`; the existing document-level overflow assertion can miss overflow contained by `.invocation { overflow: auto }`.

## Other review conclusions

- The new files remain small. No file crosses the 1000-line threshold. The meaningful structural regression is duplicated layout ownership, not component size.
- Sidebar badges reuse canonical decision wording and semantic tones, with distinct SVG shapes. Observe-mode wording remains separate from actual execution.
- The map reads archived diagnostics rather than evaluating policy. Confidence readings retain exact recorded values, WARN gate paths are advisory, missing outcomes remain explicit, and execution has no connecting policy edge.
- The atomic refresh implementation is unchanged from the fixed point. No new archive-write or evaluator path was introduced. Existing filtering, pagination, deep-link and disclosure machinery remains reachable in the code, subject to the layout defects above.
- Browser verification remains blocked. The supplied 228-test, offline inspector, Svelte and TypeScript results are reported evidence, not reruns by this reviewer. Previous screenshots and the earlier browser pass do not verify this redesign.

## Verification and limits

Read-only diff, status, source, tests and design inspection completed. `git diff --check` passed. The index is empty. No repository files were edited, tests rerun, browser sessions opened, commits created or agents delegated. Only this review artifact was written outside the repository.

After correcting the defects, current browser verification still needs to establish visual fit, container-query behavior, focus, reduced motion and badge colors. No visual approval is given here.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Completed evidence-backed read-only review; returned two actionable findings, request-changes verdict and explicit browser-validation risks."
    }
  ],
  "changedFiles": [
    "/Users/koen/.pi/agent/sessions/--Users-koen-.openforge-worktrees-Tenet-KVG-5215--/subagent-artifacts/outputs/cd46648d-65c3-44f4-820f-baaa1f50f7be/.impeccable/review/kvg-5215-working-tree-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git diff --no-ext-diff --no-color 02b1b55866406d4bd0c92ed1a17fee2424bc5b07",
      "result": "passed",
      "summary": "Reviewed tracked changes and separately inspected relevant untracked source, assets and design records."
    },
    {
      "command": "git status --short --branch --untracked-files=all",
      "result": "passed",
      "summary": "Established working-tree scope."
    },
    {
      "command": "git diff --check",
      "result": "passed",
      "summary": "No whitespace errors."
    },
    {
      "command": "git diff --cached --quiet",
      "result": "passed",
      "summary": "No staged files."
    },
    {
      "command": "bun run inspector:test:browser",
      "result": "not-run",
      "summary": "Respected the reported browser-navigation blocker and instruction not to retry."
    }
  ],
  "validationOutput": [
    "Static cascade inspection identifies overlapping panes at 901–1100px.",
    "Static positioning inspection identifies retained relative offsets in the stacked map.",
    "Supplied passing automated checks were not rerun."
  ],
  "residualRisks": [
    "Current redesign has no completed browser or visual verification.",
    "Document-level overflow assertions do not detect all overflow inside the invocation scroller."
  ],
  "noStagedFiles": true,
  "diffSummary": "Review only; no repository changes. External review artifact created.",
  "reviewFindings": [
    "P1: inspector/src/summary.css:20–45,128–143 — conflicting 1100px and 900px layout rules overlap the sidebar and inspection panes.",
    "P2: inspector/src/summary.css:158 — stacked checks retain desktop positioning offsets."
  ],
  "manualNotes": "Read the review skill, applicable instructions, changed implementation, supporting presentation/view contracts, tests and approved design references. Findings are static code conclusions, not browser observations. Merge verdict: request changes."
}
```
