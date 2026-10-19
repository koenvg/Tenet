---
name: TENET marketing
description: Owner-written rules, shown through the unpressed key
colors:
  ink: "#171717"
  paper: "#fff"
  muted: "#626262"
  rule: "#d8d8d8"
  keyTop: "#fafafa"
  keySide: "#ededed"
  keyFront: "#d9d9d9"
  accent: "#4d4d4d"
typography:
  display:
    fontFamily: 'Georgia, "Times New Roman", serif'
    fontSize: "clamp(48px, 5.5vw, 68px)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-.045em"
  body:
    fontFamily: 'Geist, "Helvetica Neue", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  action: "4px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.action}"
    padding: "12px 24px"
---

# TENET marketing design

Use this reference when changing the public React pages in `site/`. It records their composition, interaction and factual limits. The root `DESIGN.md` documents the separate inspector.

## Direction

Some actions never land. The owner writes the rules; TENET checks eligible Pi tool calls against them. A Delete key approaches its contact plate but never reaches it. The written example is "Never delete production data."

The user selected the unpressed-key study, then requested a monochrome finish inspired by an Apple keyboard and clearer blocked feedback. The current key uses a white cap, soft grey edges and dark lowercase lettering. No green or other colored accents. It replaces the paper-plane tether completely.

## Composition

Keep the centered unpressed-key hero on white. The compact Georgia headline, monochrome key, owner-written example and setup action remain the opening composition. Do not box the hero, replace the key or add a competing illustration. The repeated hero eyebrow is removed.

The hero lead identifies Pi before the action. The primary action is "Read the setup guide" and targets `./docs.html#setup`. Its visible label occurs once.

"Your rule, for example" prevents the deletion rule from reading as built-in protection. Keep the removed hero feedback/control row, limit caption and alpha note absent. Mode and alpha facts remain in Docs.

The homepage contains the hero, one policy illustration, five FAQ items and the setup close. Keep the white, monochrome identity. The separate mode demo, inspector spread, host-support strip and privacy section remain removed.

### Policy illustration

`#how-it-works` contains one unified first-step header inside `PolicyFork`. Its single h2 reads "1. Write your rule in TENET.md in plain text." The explicit number identifies the requested workflow step, not a decorative label. Keep `TENET.md` as unbroken inline code. The section and figure both use `how-title` as their accessible label.

The header has no supporting paragraph. Do not relocate or replace the removed introduction elsewhere on the homepage. The first-rule link leads to the supported declaration in the policy guide. The header reserves room for the existing 44px native playback control before hydration.

The owner selected the ASTRA comparison. The old "Your policy. In plain text." and "Same call. Different ending." headings, intervening divider and large gap are removed. The existing animation follows the unified header directly. Keep its drawing, content, geometry and motion unchanged.

One fictional Pi call branches into an unguarded outcome and an opt-in Enforce outcome. Both endings stay visible for comparison. The written rule is "Never delete production data." without the `Rule;` prefix.

The command and target path sit above two curved trajectories. The left trajectory reaches the data; the right stops at a horizontal rule above the owner's sentence. A moving ink tip marks each trajectory's leading edge, with two short arcs at the guarded contact.

The left data is wiped after arrival, then becomes `[]` for `write` or "File removed" for the other three calls. That result stays visible while the guarded trajectory approaches its rule. The right data stays intact.

"Would empty data", "Would remove file" and "Would block" describe hypothetical outcomes, not observed execution or live findings. The source says "Fictional Pi call" and the right branch says "Enforce mode · opt-in". Installation alone does not enable enforcement, and other controls may still stop an unguarded call.

Use only the unchanged registry and its abbreviated previews. Each new proposal starts with fresh fictional data, not recovered data. Do not infer coverage inside subprocesses.

Keep the current white, ink and grey palette. The unified heading inherits the section's Georgia at 32px to 44px. The inline filename uses monospace at .8em. Branch headings remain 21px to 30px and the rule remains 21px to 28px.

Use 16px to 24px monospace for the command, 14px for data and 13px for data on phones. Supporting labels are 13px Geist. Data fields have a light grey ground and a thin top rule, without app-window chrome, counts or progress meters.

Both branches remain side by side on phones. Below 700px, their headings sit above the curves and "opt-in" stays together on its own line. Code wraps within reserved command, drawing and data heights.

`PolicyFork.tsx` renders the figure; `fork-model.ts` derives readonly `ForkPose` values from `StoryFrame`. Partial Bézier paths end at the moving tip instead of relying on scaled dash lengths. `bind-fork.ts` caches the figure's nodes and paints its paths, data wipe and outcomes.

`policy-fork.css` affects only this figure. The rule, command and outcomes are HTML text; the SVG carries only paths. The figure owns the unified `how-title` heading, first-rule link, 44px control, focus ring, announcements and node cache. Its outer margin is zero, with no internal section divider. The source keeps its existing 40px header gap, reduced to 32px below 700px.

The existing playback hook owns the figure's clock and observers through the stable `bindFork` factory. The first approach and loss hold show the left outcome; the middle hold retains it before the second approach and blocked hold. These timings illustrate the story, not evaluator latency.

Pause, offscreen state and document hiding stop the native clock and frame writes. Reduced motion starts with the unguarded snapshot and no timeline. The icon reveals the guarded ending, then advances to the next unguarded example.

Changing the motion preference settles the guarded pair without restarting playback. Without JavaScript, the completed first pair remains visible and no inert button is rendered. The illustration starts no requests or tool calls.

Do not restore the removed figcaption, Previous/Next and replay row, example counter, qualification footer or proposal/example/safety disclosures. No duplicate rule banner precedes the figure. Keep historical evaluator fixtures and reports unchanged; the browser imports no evaluator, backend or private report.

Policy grammar, owner authoring, default observe behavior, missing execution facts and one-call approval remain in the linked Docs page and policy guide. The FAQ retains the essential privacy, recording and coverage facts. Preserve those destinations and the first-rule/setup links.

### FAQ and setup

`#faq` keeps its five native disclosures. They explain default observe behavior, explicit enforcement opt-in, hook limits, fallible judgments, TypeSafe disclosure and quota, default secret-bearing local recording, opt-out and retained records. The alpha installation question leads to the setup guide rather than a signup or invented public release.

`#get-started` keeps the policy's `Rule;` syntax beside the next action. Detailed Pi version, SDK duties, Claude prototype limits, inspector behavior and recording safeguards live in Docs and its maintained references. Recordings' unencrypted, owner-restricted storage and best-effort capture remain explicit under `docs.html#limits`.

Do not restore the removed mode, inspector, workflows or privacy sections, their navigation anchors, or their unused component and styles.

### Spacing and navigation

Use generous separation between the hero, animation, FAQ and setup close, with tighter spacing inside the animation. Do not replace the removed sections with cards, new disclosures or filler.

The header links to How it works, FAQ and Docs. The footer links to documentation, `docs.html#limits`, FAQ and the repository. Removed section IDs have no navigation links; the skip link still focuses the main content.

All controls have at least 44px targets. At 700px, the FAQ and setup close use one column; the illustration keeps both outcomes side by side. Code wraps instead of widening the page.

At 320px and a 640px CSS viewport equivalent to 200% zoom on 1280px, navigation and content reflow without a JavaScript menu. The Docs page retains its existing reading layout.

### Local demonstrations

`policy-routes.ts` owns the unchanged readonly four-route registry. `policy-story.ts` owns the five phases, unchanged durations, route transitions, closed loss outcomes and data text. Its readonly `StoryFrame` contains route, phase and native-clock progress.

`use-policy-playback.ts` owns the discriminated playback state of `waiting`, `playing`, `paused`, or `static`. A route index identifies the current proposal; a run identity and disposed callback guard prevent stale completion from advancing a replaced timeline.

`PolicyFork` invokes that controller with `bindFork`. The `SceneBinding` contract supplies the observed circuit SVG, native timeline target and imperative frame painter. The binding is constructed once per mounted root and owns no clock or subscriptions.

Native timelines, frame writers, visibility observers, node caches, announcements and user controls remain instance-local. OS motion preferences apply without restarting a user-paused animation.

The animation accepts no arbitrary policy input, evaluates no action, writes no settings and starts no requests. It uses the parent's `motion.ready` seam. Before readiness, static HTML shows the first completed pair and no icon control.

The production build ships the SVG's CSS without requiring JavaScript. Hydration preserves scene dimensions. The icon's title, accessible name and keyboard focus remain usable when its action changes.

## Color and type

Use self-hosted Geist for body text and Georgia for the study's editorial headline. All colors are neutral black, white or grey. The key has a white cap, light-grey rounded side faces, fine grey outlines and dark system-font lettering. The italic headline is charcoal. The SVG's flat contact shadow conveys distance, not a card or a raised UI panel. No gradients or decorative effects.

The hero's written rule remains readable HTML. The SVG has a static accessible title and description. Its tiny tool-call and production labels are supplemental; neither is required to understand the example.

With JavaScript, a native button wraps the illustration so the visitor can try the key. Without JavaScript it remains a static image, with no inert button.

"Try pressing Delete" appears between the key and its caption only after hydration makes the key interactive. Reserve the hint's space while it is hidden so hydration does not move the caption. Keep the button's accessible name "Try pressing delete".

## Motion

The hero's `use-key-motion.ts` hook retains one four-second intro and a 480ms attempted press. The key stops above the plate. Its SVG "Blocked" label remains; the removed HTML result/status/control API does not return.

An attempt interrupts the intro, starts from the current key position and does not queue extra presses. A polite, visually hidden live region reports user attempts.

Reduced motion settles the key without spatial movement, including when the preference changes during a press. Suspend hero frames offscreen and while the document is hidden.

The policy story retains five phase durations, with 1400ms before, 1600ms lost, 700ms installing, 1400ms after and 1900ms blocked. These seven seconds are illustrative, not provider latency.

The unguarded tip reaches the data at 82% of the first approach, then the fictional data wipes before changing to its loss outcome. The guarded approach reaches the horizontal rule and holds there visibly. The fourth pair wraps to the first with fresh example data.

One native WAAPI timeline supplies phase time to a single gated animation-frame writer. Paths, tips, impact arcs, data clipping and HTML outcomes all use `ForkPose`. React does not rerender per frame.

Pause/resume preserves the timeline's actual time. Offscreen detection observes the SVG itself, not its larger HTML readout area. Pause, document hiding and offscreen state stop both native time and animation-frame writes. Cleanup cancels the timeline and pending frame and detaches its completion callback.

Reduced motion starts with the first unguarded snapshot. The same icon shows its guarded counterpart, then advances to the next proposal's unguarded snapshot, cycling all four without animation. Enabling reduced motion cancels the clock and shows the guarded snapshot; disabling it does not restart motion or discard keyboard focus. Play then starts the selected proposal's pair. Automatic transitions do not announce every phase to a screen reader.

Without JavaScript, the inline SVG and HTML show the first completed pair and controls remain absent. Header navigation, setup links and FAQ still work.

## Claims

- The user writes the example rule. Do not present it as built-in protection.
- Policy examples compare before TENET with opt-in enforcement. Observe mode only reports, and installation alone does not enable enforcement.
- The deletion illustrations are hypothetical. Previous synthetic overwrite assessments do not validate the new examples, prove execution or establish universal interception.
- Do not imply that TENET hooks physical keyboards, restores deleted data or inspects subprocesses.
- Preserve the FAQ's coverage and recording facts and the linked detailed limits, including local evidence, possible code or secrets, and the recording opt-out.
- Alpha access is documentation-led. The recommended archive is a private passing-main GitHub Actions artifact, not an npm package, public release or signup flow.
- Observe never blocks or opens approval, including unavailable assessments. Enforcement requires an explicit new Pi process; native approval covers one unchanged pending invocation.
- TypeSafe receives policy, paths, tool evidence and bounded recent observations for real assessments and uses quota. Redaction cannot remove every secret.
- `TENET_RECORDING=off` stops new local capture, not provider disclosure or native findings. Old records remain until separately removed.
- Findings and permissions are not proof of execution. Keep this distinction in the linked operation and inspector guides; missing evidence is not a pass.
- Do not invent integrations, customers, pricing, safety metrics, guarantees or deployment facts. Metadata has no guessed canonical domain or social image. No new public assets or runtime dependencies are needed.
