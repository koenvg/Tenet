---
version: 1
slug: "inspector-src-app-svelte"
primary_target: "inspector/src/App.svelte"
related_targets: ["inspector/src/Detail.svelte","inspector/src/RuleDetail.svelte","inspector/src/style.css"]
---

# Decision debugger

Mode: Operate. Developers investigating a blocked call or a questionable assessment. Replace the inspector's full flow; retain read-only archive access and recorded provenance. Approved by owner in chat after choosing Decision debugger.

## Direction contract

THESIS: Make the latest recorded decision understandable before exposing debugging data. Use action, decision and execution as distinct steps, followed by the recorded reason.

OWN-WORLD: Preserve the graphite application bar, pale explorer, white reading area, blue selection, and restrained semantic status colors. System sans for reading; monospace for recorded commands. Thin separators, no decorative cards.

STORY: Open the latest call on a fresh visit, see its action and outcome, understand the contributing rule, then reveal other rules or technical evidence if needed. Direct links and manual selections take priority over live updates.

FIRST VIEWPORT: A compact recent-call explorer beside one readable summary column. An icon-and-label sequence separates Action, TENET decision and Actual execution. The deciding rule and exact confidence threshold are visible; other rules, probability tables, identifiers and evidence start collapsed. On mobile, Calls and Summary retain selection. Signature interaction: opening submitted questions reveals the evidence section and transfers keyboard focus, preserving its scroll position on subsequent rule changes. Selection uses a short background transition with reduced-motion support.

FORM: Owner-approved refinement of the existing Decision debugger, code-led. Original seed 5c4b72e9 retained as provenance; the approved summary composition supersedes the split-pane layout. No new visual world or generated assets.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Boundaries

Use recorded gates and distributions only. No new evaluator logic, model rationale or questionable-assessment score. Keep passes and integrity accessible, missing stages explicit, probability labels unrounded, and approval separate from permission/execution. No live polling or project-filter expansion in this redesign. No shipping raster assets planned.

## Owner feedback

Replace pane-width sliders with draggable, keyboard-operable separators. Use reusable semantic status chips, including green PASS without hiding its confidence gate. Default submitted questions to readable Markdown instructions and explicit answer choices, with a Rich / JSON toggle preserving the recorded object. Markdown is inert: no active HTML, navigation or remote images.

KVG-5215: Owner approved a less cluttered overview focused on understanding the latest decision. Separate the policy decision from actual execution, use visual status icons and exact confidence indicators, collapse technical data, and remove the always-open evidence pane. Keep all archived details reachable and incomplete assessments explicit. Preserve live updates and project filtering without expanding them.
