# Inspector design

## Approved direction

Build the decision map with the Focus sidebar. This current guide is for inspector contributors working in a developer checkout. Use it to preserve the owner-approved layout and recorded-data boundaries, not to infer runtime protection.

The owner selected the Open map composition, then replaced its horizontal call strip with the sidebar from `.impeccable/mocks/decision/tenet-focus.png` for many calls. The map reference remains `.impeccable/mocks/decision/tenet-decision-map.png`.

This is a session-specific comp-led build. `.impeccable/config.json` is unchanged.

## Layout

- The light toolbar has project/session selection, a read-only label and manual refresh.
- The neutral left sidebar has a category filter and individually selectable calls only. It scrolls vertically and paginates independently. The selected row joins the white workspace. Width starts at 300px, adjustable from 220–460px by pointer or keyboard.
- Decision and Uncertainty groups are separate workspace views. The map shows the action, independent checks and recorded policy decision. Actual execution sits below, with no causal connection.
- The group view explains shared policy/profile/rule/gate identity, distinguishes policy digests and keeps individual invocation links. Call filtering does not change session-wide groups.
- Reader build/schema status and partial-archive warnings stay above the workspace. Recording issue details stay collapsed until requested.
- Selecting a check opens and focuses its rule details. Questions, shared evidence, all rules and recording details remain below the map.
- Below 900px, Calls, Summary and Patterns become separate views. Below 850px of available workspace width, the map uses vertical branches. Sidebar resizing can also trigger this layout.

## Appearance and motion

Use black type and nodes, a white workspace, neutral `#efefed` sidebar and muted `#be3737` recorded blocking contributions. WARN uses labeled advisory paths, not blocking paths. Keep unknown coverage explicit.

At the owner's request, sidebar decisions use stronger badges: green check for ALLOW, red stop symbol for BLOCK and amber question mark for ASK. Keep observe wording such as "Would block", and keep unknown decisions distinct.

Selection changes row background, not decision color. Shapes and text supplement color.

The wordmark uses Kode Mono. Commands and measurements use monospace; ordinary copy uses the platform sans stack. Bundle Kode Mono in the stylesheet, never fetch it at runtime.

Source: Google Fonts, `https://fonts.googleapis.com/css2?family=Kode+Mono:wght@400..700&display=swap`. SIL license: `inspector/src/fonts/OFL-Kode-Mono.txt`.

Selection draws the selected connection once in 420ms. There is no polling animation or entrance animation. Reduced motion disables the draw. Icons and connections are authored SVG; mock images are references, not shipping assets.

## Data boundaries

`decision-map.ts` projects archived diagnostics. It must not evaluate policy. Rule outcome, confidence gates, decision, permission and execution are distinct facts.

PASS can coexist with failed confidence. Missing or unknown data is not a pass. WARN does not block. Never invent evaluator reasoning or serial dependencies between independent checks.

Preserve atomic refresh publication in `archive-state.ts`. Unchanged polls must not mutate the workspace, move content, replay motion or replace mounted detail state. Keep deep links, manual selection, project filters, pagination, historical questions and exact recorded probabilities.

See [inspector use](docs/inspector.md) and [recorded evidence explanations](docs/inspection-evidence.md#recorded-and-inspector-explanations) for the reader-visible meaning.

## Verification status

These are recorded verification claims from the latest layout pass, not new checks run for a documentation edit. That pass moved session-wide uncertainty groups out of the sidebar and gave policy decisions more map space.

Desktop/mobile states were inspected in the local artifacts `coverage/inspector-artifacts/triage-{desktop,mobile,groups-desktop,groups-mobile}.png`.

That pass recorded:

- 14 passing component tests and 23 passing real-browser tests, including filters, group links, mobile navigation, resizing and historical deep links.
- TypeScript and Svelte checks without diagnostics.
- No findings from the Impeccable layout detector.

The previous KVG-5215 Request changes report is `.impeccable/review/kvg-5215-working-tree-review.md`. Its conflicting responsive grid and node offsets were corrected earlier.

The fresh TENET-1 layout review found three gaps: groups vanished without a selected call, target paths were hidden, and call-list responses eagerly included groups. Session-level group navigation, visible target identity and a lazy group endpoint resolved them. Grouped call links also return keyboard focus to the decision control. No second review pass was run.
