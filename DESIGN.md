# Inspector design

## Approved direction

Decision map, with the Focus sidebar. The owner selected the Open map composition, then replaced its horizontal call strip with the sidebar from `.impeccable/mocks/decision/tenet-focus.png` to accommodate many calls. The map reference remains `.impeccable/mocks/decision/tenet-decision-map.png`. This is a session-specific comp-led build; `.impeccable/config.json` is unchanged.

## Layout

- Light toolbar: project/session selection, read-only label, manual refresh.
- Neutral left sidebar: action icons, readable call names and decisions, timestamps, independent vertical scrolling and existing pagination. The white selected row joins the white workspace. Width starts at 300px and is adjustable from 220–460px by pointer or keyboard.
- Main workspace: action, independent checks for the selected rule, recorded policy decision. Actual execution sits separately, without a causal connection from policy.
- Check selection opens and focuses the corresponding rule details. Submitted questions, shared evidence, all rules and recording details remain available below the map.
- Below 900px, Calls and Summary are separate views. Below 850px of available workspace width, the map becomes a vertical branch layout; sidebar resizing can also trigger this layout.

## Appearance and motion

Black type and nodes, white workspace, neutral `#efefed` sidebar, muted `#be3737` recorded blocking contributions. WARN contributions use labeled advisory paths rather than blocking paths. Unknown coverage remains explicit.

Sidebar decisions use stronger badges at the owner's request: green check for ALLOW, red stop symbol for BLOCK, amber question mark for ASK. Preserve observe-mode wording, such as "Would block", and keep unknown decisions distinct. Selection changes the row background, not its decision color. Shapes and text supplement color.

The wordmark uses Kode Mono; commands and measurements use monospace, ordinary interface copy uses the platform sans stack. Kode Mono is bundled into the stylesheet rather than fetched at runtime. Source: Google Fonts, `https://fonts.googleapis.com/css2?family=Kode+Mono:wght@400..700&display=swap`; SIL license: `inspector/src/fonts/OFL-Kode-Mono.txt`.

Selection draws the selected connection once in 420ms. There is no polling animation or entrance animation. Reduced motion disables the draw. Icons and connections are authored SVG; mock images are references, not shipping assets.

## Data boundaries

`decision-map.ts` projects archived diagnostics; it must not evaluate policy. Rule outcome, confidence gates, the policy decision, permission and execution are distinct facts. PASS may coexist with failed confidence. Unknown or missing data is not a pass. WARN does not block. Never fabricate evaluator reasoning or serial dependencies between independent checks.

Keep the atomic refresh publication in `App.svelte`: unchanged polls must not mutate the workspace, move content, replay motion or replace mounted detail state. Preserve deep links, manual selection, project filtering, pagination, historical questions and exact recorded probabilities.

## Verification status

Implementation is in progress. Offline UI regressions, 228 core tests, Svelte checks and TypeScript checks pass. The single fresh-context completion review identified conflicting responsive grid rules and retained desktop node offsets. Both have been corrected; its original Request changes report is `.impeccable/review/kvg-5215-working-tree-review.md`. Workspace layout now has one owner, `summary.css`, and one 900px mobile switch.

Updated browser tests cover sidebar scrolling, resizing, map selection, reduced motion, badge colors, intermediate-width pane bounds, stacked branches and scroller overflow. They remain unexecuted after the fixes because fresh Chrome instances stall during local-page navigation before rendering. Existing review screenshots and the earlier eight-test browser pass verify the previous overview, not this redesign. Current visual/browser verification and visual finish approval remain pending.
