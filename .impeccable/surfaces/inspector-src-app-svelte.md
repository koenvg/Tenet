---
version: 1
slug: "inspector-src-app-svelte"
primary_target: "inspector/src/App.svelte"
related_targets: ["inspector/src/Detail.svelte","inspector/src/RuleDetail.svelte","inspector/src/style.css"]
---

# Decision debugger

Mode: Operate. Developers investigating a blocked call or a questionable assessment. Replace the inspector's full flow; retain read-only archive access and recorded provenance. Approved by owner in chat after choosing Decision debugger.

## Direction contract

THESIS: Start with the decision, keep its evidence within reach. Replace the long stacked detail document with a debugger workspace.

OWN-WORLD: A dark graphite application bar, pale explorer, white inspection panes, blue selection and restrained amber/red status ink. Workhorse system sans; monospace only for captured data. Thin separators, compact rows, no decorative cards.

STORY: Select a session and call, understand its recorded gates, inspect each rule, then compare the assessment with exact submitted questions and shared evidence.

FIRST VIEWPORT: Compact header over a left call explorer. The remaining width holds a pinned decision explanation above a rule inspector and a docked evidence reader. Desktop pane widths are adjustable. On phones, Calls, Assessment and Evidence views retain selection. Signature interaction: selecting a rule updates its assessment and question mapping while shared evidence stays at its scroll position. A short background transition identifies selection; reduced motion is immediate.

FORM: Decision debugger, first grounded candidate; owner chose the pick over assigned candidate three. Seed 5c4b72e9. Code-led; no generated comp exists or is owed.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Boundaries

Use recorded gates and distributions only. No new evaluator logic, model rationale or questionable-assessment score. Keep passes and integrity accessible, missing stages explicit, probability labels unrounded, and approval separate from permission/execution. No live polling or project-filter expansion in this redesign. No shipping raster assets planned.

## Owner feedback

Replace pane-width sliders with draggable, keyboard-operable separators. Use reusable semantic status chips, including green PASS without hiding its confidence gate. Default submitted questions to readable Markdown instructions and explicit answer choices, with a Rich / JSON toggle preserving the recorded object. Markdown is inert: no active HTML, navigation or remote images.
