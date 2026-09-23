---
version: 1
slug: "inspector-src-app-svelte"
primary_target: "inspector/src/App.svelte"
related_targets: ["inspector/src/Detail.svelte","inspector/src/RuleDetail.svelte","inspector/src/style.css"]
---

# Decision debugger

Mode: Operate. Developers investigating a blocked call or a questionable assessment. Replace the inspector's full flow; retain read-only archive access and recorded provenance. Approved by owner in chat after choosing Decision debugger.

## Direction contract

THESIS: Explain a recorded decision through its contributing checks, not a stack of dashboard cards or a debugger split pane.

OWN-WORLD: Plain near-white canvas, carbon-black nodes, restrained red contributing paths, thin gray connections and readable sans type. Exact measurements and commands remain monospace. The approved Open map comp is `.impeccable/mocks/decision/tenet-decision-map.png`.

STORY: Choose a session and recent call, see the action and recorded checks feeding its policy result, then select a check to inspect evidence below. Actual execution stays separate.

FIRST VIEWPORT: Light toolbar, Focus-style left sidebar and a white Decision map workspace. Recent calls scroll independently; the selected row joins the workspace. Action left, independent checks center, policy right, actual execution below and separate. Evidence disclosures follow. The map stacks when its available width is narrow, including after sidebar resizing. Selected connections draw once; unchanged polls never replay motion. Reduced motion is static.

FORM: Owner selected the Decision map challenger, seed 86284fc8, and approved the Open map layout over Map + evidence and Rule lanes. Comp-led for this session only. Connections are runtime data graphics, not painted assets.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Boundaries

Use recorded gates and distributions only. No new evaluator logic, model rationale or questionable-assessment score. Keep passes and integrity accessible, missing stages explicit, probability labels unrounded, and approval separate from permission/execution. No live polling or project-filter expansion in this redesign. No shipping raster assets planned.

## Owner feedback

Replace pane-width sliders with draggable, keyboard-operable separators. Use reusable semantic status chips, including green PASS without hiding its confidence gate. Default submitted questions to readable Markdown instructions and explicit answer choices, with a Rich / JSON toggle preserving the recorded object. Markdown is inert: no active HTML, navigation or remote images.

KVG-5215: Owner approved a less cluttered overview focused on understanding the latest decision. Separate the policy decision from actual execution, use visual status icons and exact confidence indicators, collapse technical data, and remove the always-open evidence pane. Keep all archived details reachable and incomplete assessments explicit. Preserve live updates and project filtering without expanding them.

## Approved replacement layout, implementation in progress

The owner approved replacing the whole inspector's visual identity and navigation. Open map was selected over Map + evidence and Rule lanes. During implementation, the owner explicitly replaced the horizontal recent-call strip with the left sidebar from Focus (`.impeccable/mocks/decision/tenet-focus.png`) because many calls need scalable navigation. This hybrid supersedes the original navigation composition; it does not reopen the visual direction.

Approved map: `.impeccable/mocks/decision/tenet-decision-map.png`; approved sidebar: `.impeccable/mocks/decision/tenet-focus.png`. Choice and constraints: `.impeccable/mocks/decision/tenet-choice.json`. Plain neutral canvas, black nodes, muted red recorded blocking contributions; vertically scrollable calls with action icons, a white connected selection, and evidence below the map. Execution remains separate.

Use comp-led implementation for this session only, without changing the project's recorded default. Animate deliberate selection once; do not replay transitions during unchanged polling. On narrow screens stack the relationships while retaining keyboard access and the selected rule. Rendering must use recorded gates, never invented evaluator reasoning.
