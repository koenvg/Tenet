# Marketing site handoff

## Current change: unpressed key

The user selected the keypress study, then requested clearer blocked feedback and a monochrome finish like an Apple keyboard. The homepage uses a centered, unboxed composition on white, with charcoal copy, a white keycap and light-grey side faces. A high-contrast "Blocked" label appears beside the stopped key. The previous paper-plane implementation is removed.

The headline is "Some actions never land." The caption labels "Never delete production data." as the user's example rule, not a built-in restriction. The key stops before making contact, then a blocked finding appears. The page does not send a tool call or delete data.

`site/index.html` contains the accessible SVG and complete no-JavaScript scene. `site/hero.js` adds a four-second single play with pause, resume and replay. It suspends frames when the illustration is offscreen or the document is hidden. Reduced motion starts at completion and completes active playback when enabled. Explicit replay opts into motion.

The mode qualifier stays visible beneath the CTA. The explanation distinguishes observe from opt-in enforcement. Coverage and recording details use a native disclosure, including possible code or secrets in local evidence and the recording opt-out. The uncertainty and sandbox disclaimer remains visible in the footer. The docs page retains its reading layout. Design references are `site/DESIGN.md` and `site/.impeccable/design.json`.

## Serving and deployment

For development: `python3 -m http.server 5174 --directory site`.

The production Docker image copies only allowlisted public assets. `site/Dockerfile` and `site/.dockerignore` include `hero.js`. `node site/smoke.mjs <base-url>` checks pages, the script, fonts and private-path exclusions.

The refreshed local preview container is `tenet-hero-preview`, bound to `http://127.0.0.1:5184`. The existing private Tailscale TCP proxy on port 59948 serves it. The preview remains private; opening a pull request does not publish the site.

## Validation

Pre-implementation commit: `c64a94c1ece0bc56656c4c54e00b90e2581e3319`.

- The updated content test failed against the email hero, then passed. The motion check failed before the new keypress controller was connected, then passed.
- `bun test test/marketing-site.test.mjs`: 5 tests, 57 assertions passed.
- `node --check site/hero.js`, design JSON parsing and `git diff --check` passed.
- `node test/marketing-layout-check.mjs` passed in user-approved isolated headless Chromium. It covers four-second completion, pause/resume/replay, final hold, offscreen and simulated hidden-document suspension, six viewports, keyboard disclosure access, reduced-motion changes, no-JavaScript navigation, 200% CSS zoom and shared docs styling.
- The offscreen test uses real rendering turns for IntersectionObserver. A mocked-clock-only version raced the observer callback and was corrected before the passing run.
- Desktop and mobile screenshots were inspected at thread-storage paths `reports/keypress-1440.png` and `reports/keypress-390.png`. Set `TENET_SCREENSHOT_DIR` to an existing directory when running the layout check to refresh them.
- `bun run inspector:build` passed.
- `TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000`: 486 passed. The short temp path avoids macOS socket-path limits.
- `bun run typecheck` and `bun run inspector:check` passed with no diagnostics.
- `CI=1 bun run inspector:test`: 16 component tests and 24 browser tests passed.
- Production Docker build and all 21 HTTP smoke checks passed. The private Tailscale route returned the new keypress page with HTTP 200.
- The single fresh-context completion review approved the complete diff with no blockers. Its non-blocking readability note was addressed by enlarging the owner-example label from 10px to 12px. Report: thread storage `reports/keypress-completion-review.md`.
- The reviewer independently reran the focused tests, script syntax, diff check, design JSON parsing, browser layout checks and all 21 HTTP smoke checks. Its Impeccable detector exited 2 with warnings/advisories, not a clean pass. Remaining typography/documentation advisories were not functional or structural blockers.
- After the label adjustment, the focused tests, browser layout checks, JSON/diff checks, Docker build and 21 HTTP smoke checks passed again. Screenshots and the private preview were refreshed.

Coverage limits: Chromium only. No physical-device, live screen-reader, browser text-only enlargement or back-forward-cache checks. Hidden-document behavior is simulated; enlargement uses CSS zoom. No live TypeSafe evaluation was run.

## Rounded-key correction

The user reported a square corner on the key. The side faces were quadrilaterals that extended beyond the rounded cap. Both now follow the cap's projected radius-17 outline, extruded 49px downward. The cap, palette, layout and four-second motion are unchanged.

- A browser regression check probes both former protruding corner tips. It failed on the old geometry and passed after the correction.
- The five focused tests, complete marketing browser checks, Docker build and 21 HTTP smoke checks passed. The private preview serves the corrected SVG. Desktop/mobile captures were refreshed. Close-up evidence is in thread storage at `reports/key-corners-before.png` and `reports/key-corners-after.png`.
- This follow-up changes only the static SVG, its browser regression check and these notes. The earlier full application/inspector checks were not repeated because no application code, dependencies or shared styles changed.
- The single fresh-context corner-fix review approved the complete change with no findings. Report: thread storage `reports/rounded-key-review.md`.

## Monochrome key and clearer blocking

The user asked for stronger blocked feedback and shades of black and white like an Apple keyboard. The cap is now white, the rounded side faces are light grey, and the lowercase legend is dark. Headline, controls, supporting copy and shared dividers also use neutral greys. The faint stop marks were replaced with a charcoal "Blocked" label beside the key; the result underneath is larger and emphasizes "Delete blocked". Timing, controls, geometry and enforcement qualifications are unchanged.

- The new content and neutral-palette tests were observed failing first, then passed: 6 focused tests, 106 assertions.
- The complete marketing browser checks passed, including new assertions that the blocked label appears after approach and stays inside the illustration across all six viewports. Previous rounded-corner probes still pass.
- Desktop and mobile screenshots were inspected at thread-storage paths `reports/monochrome-1440.png` and `reports/monochrome-390.png`.
- Script syntax, design JSON parsing, `git diff --check`, Docker build and all 21 HTTP smoke checks passed. The private Tailscale preview serves this version.
- Full application/inspector suites were not repeated for these SVG, CSS, documentation and marketing-test changes. Their earlier results above apply to the initial keypress implementation. No application code, dependencies or motion-controller logic changed.
- The single fresh-context completion review approved this revision with no blocking findings. It independently passed the focused tests, complete browser checks, syntax/JSON/diff checks and 21 HTTP smoke checks, and confirmed served assets match the working tree. Report: thread storage `reports/monochrome-blocked-review.md`.
- The review's Impeccable detector exited 2 with typography/documentation advisories, not a clean pass. Small supporting text remains a readability consideration; no functional or structural defect was found.

## Interactive attempted press

The user asked to click the key and try pressing it without an action happening. JavaScript now wraps the SVG in a native button. Click, tap, Enter and Space trigger a 480ms dip and return that stays above the contact plate. The blocked label remains visible, and a polite live region reports each attempt. Rapid attempts restart from the current position without queuing. An early click replaces the intro with the attempt. Existing pause, visibility suspension and replay remain available.

Reduced-motion attempts report the outcome without movement; enabling reduced motion stops an active press. Without JavaScript, the original accessible static illustration remains and no inert key button is added. Nothing is deleted and interaction makes no network request.

The new browser click test was observed failing before implementation, then passed. The expanded browser suite also covers touch, Enter, Space, visible focus, early presses, pause/resume during a press, rapid retries, replay after interaction and reduced-motion changes. Desktop/mobile and peak-press captures were inspected in thread storage at `reports/keypress-1440.png`, `reports/keypress-390.png` and `reports/keypress-pressed.png`. Focused tests currently pass with 6 tests and 108 assertions.

Full verification passed on this revision: inspector build, 487 Bun tests, project typecheck, Svelte checks with no diagnostics, 16 inspector component tests and 24 browser tests. Script syntax, design JSON parsing, diff checks, production Docker build and all 21 HTTP smoke checks also passed. The private preview serves the interactive version.

The single completion review found one P2 browser-test synchronization defect, with no production or structural blocker. The test compared geometry before the browser delivered the reduced-motion change event. It now waits for the Replay control before checking the settled key, without adding a fixed sleep. The complete browser suite passed three consecutive runs after this fix; the 6 focused tests and diff check also passed again. No production change or second review was needed. Report: thread storage `reports/interactive-key-review.md`.

The review's design detector exited 2 with typography/design-record advisories, not a clean pass. Small supporting text remains a readability consideration. Browser, screen-reader and physical-device coverage limits listed above still apply.
