# Inspector design

## Approved direction

Decision map, with the Focus sidebar. The owner selected the Open map composition, then replaced its horizontal call strip with the sidebar from `.impeccable/mocks/decision/tenet-focus.png` to accommodate many calls. The map reference remains `.impeccable/mocks/decision/tenet-decision-map.png`. This is a session-specific comp-led build; `.impeccable/config.json` is unchanged.

## Layout

- Light toolbar: project/session selection, read-only label, manual refresh.
- Neutral left sidebar: category filter and individually selectable calls only, with independent vertical scrolling and pagination. The selected row joins the white workspace. Width starts at 300px and is adjustable from 220–460px by pointer or keyboard.
- Main workspace: Decision and Uncertainty groups are separate views. The decision map shows the action, independent checks and recorded policy decision; actual execution sits below, without a causal connection. The group view explains the shared policy/profile/rule/gate identity, distinguishes policy digests and retains individual invocation links. Call filtering does not change session-wide groups.
- Reader build/schema status and partial-archive warnings stay visible above the workspace; recording issue details are collapsed until requested.
- Check selection opens and focuses the corresponding rule details. Submitted questions, shared evidence, all rules and recording details remain available below the map.
- Below 900px, Calls, Summary and Patterns are separate views. Below 850px of available workspace width, the map becomes a vertical branch layout; sidebar resizing can also trigger this layout.

## Appearance and motion

Black type and nodes, white workspace, neutral `#efefed` sidebar, muted `#be3737` recorded blocking contributions. WARN contributions use labeled advisory paths rather than blocking paths. Unknown coverage remains explicit.

Sidebar decisions use stronger badges at the owner's request: green check for ALLOW, red stop symbol for BLOCK, amber question mark for ASK. Preserve observe-mode wording, such as "Would block", and keep unknown decisions distinct. Selection changes the row background, not its decision color. Shapes and text supplement color.

The wordmark uses Kode Mono; commands and measurements use monospace, ordinary interface copy uses the platform sans stack. Kode Mono is bundled into the stylesheet rather than fetched at runtime. Source: Google Fonts, `https://fonts.googleapis.com/css2?family=Kode+Mono:wght@400..700&display=swap`; SIL license: `inspector/src/fonts/OFL-Kode-Mono.txt`.

Selection draws the selected connection once in 420ms. There is no polling animation or entrance animation. Reduced motion disables the draw. Icons and connections are authored SVG; mock images are references, not shipping assets.

## Data boundaries

`decision-map.ts` projects archived diagnostics; it must not evaluate policy. Rule outcome, confidence gates, the policy decision, permission and execution are distinct facts. PASS may coexist with failed confidence. Unknown or missing data is not a pass. WARN does not block. Never fabricate evaluator reasoning or serial dependencies between independent checks.

Keep the atomic refresh publication in `App.svelte`: unchanged polls must not mutate the workspace, move content, replay motion or replace mounted detail state. Preserve deep links, manual selection, project filtering, pagination, historical questions and exact recorded probabilities.

## Verification status

The latest layout pass moves session-wide uncertainty groups out of the call sidebar and gives policy decisions more room in the map. The desktop and mobile states were inspected in `coverage/inspector-artifacts/triage-{desktop,mobile,groups-desktop,groups-mobile}.png` (local test artifacts). The complete inspector suite passes: 14 component tests and 23 real-browser tests, including filtering, group links, mobile navigation, resizing and historical deep links. TypeScript and Svelte checks pass without diagnostics; the Impeccable layout detector reported no findings.
The previous KVG-5215 review's Request changes report is `.impeccable/review/kvg-5215-working-tree-review.md`; its conflicting responsive grid and node offsets were corrected earlier. The fresh TENET-1 layout review found three gaps: groups disappeared without a selected call, target paths were hidden, and call-list responses eagerly included groups. These are resolved with session-level group navigation, visible target identity and a lazy group endpoint; grouped call links also return keyboard focus to the decision control. No second review pass was run.
