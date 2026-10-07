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

This file applies to `site/`. The root `DESIGN.md` documents the separate inspector.

## Direction

Some actions never land. The owner writes the rules; TENET checks eligible tool calls against them. A Delete key approaches its contact plate but never reaches it. The written example is "Never delete production data."

The user selected the unpressed-key study, then requested a monochrome finish inspired by an Apple keyboard and clearer blocked feedback. The current key uses a white cap, soft grey edges and dark lowercase lettering. No green or other colored accents. It replaces the paper-plane tether completely.

## Composition

One centered composition on an uninterrupted white page. The compact headline leads directly into the key, the owner's rule, the outcome and the documentation CTA. No boxed scene, side illustration, dashboard cards or changing headline text.

The HTML caption says "Your rule, for example" so the deletion restriction cannot be mistaken for a built-in policy. A short opt-in enforcement qualifier stays visible beneath the CTA. The explanation distinguishes observe and enforce. Coverage and recording details live in a keyboard-accessible native disclosure. The uncertainty and sandbox disclaimer stays visible in the footer.

At 700px the explanation becomes one column. The outcome and motion control wrap naturally. Short screens scroll; the CTA and qualifiers must remain reachable without overlap or horizontal scrolling. The docs page keeps its existing reading layout.

## Color and type

Use self-hosted Geist for body text and Georgia for the study's editorial headline. All colors are neutral black, white or grey. The key has a white cap, light-grey rounded side faces, fine grey outlines and dark system-font lettering. The italic headline is charcoal. The SVG's flat contact shadow conveys distance, not a card or a raised UI panel. No gradients or decorative effects.

The written rule and outcome remain readable HTML. The SVG has a static accessible title and description. Its tiny tool-call and production labels are supplemental; neither is required to understand the example. With JavaScript, a native button wraps the illustration so the visitor can try the key. Without JavaScript it remains a static image, with no inert button.

## Motion

The React `use-key-motion.ts` hook runs one four-second sequence. The key descends, stops above the plate and settles. A high-contrast "Blocked" label appears beside it, then the finding fades in beneath the written rule. "Delete blocked" is emphasized in the HTML result. No data disappears, no deletion executes, and nothing is restored. The final frame holds without looping.

Clicking or tapping the key, or pressing Enter or Space while it is focused, starts a 480ms attempted press. It dips toward the plate and returns to the blocked position without touching the plate or executing anything. An attempt interrupts the intro, begins from the current key position and does not queue extra animations on rapid clicks. The label stays blocked. A polite live region announces each attempt without changing the visible copy.

Reduced-motion attempts update the feedback without moving the key. Changing to reduced motion during a press settles it immediately. The existing pause and visibility controls also apply to an interactive press.

One keyboard-accessible button changes between Pause animation, Resume animation and Replay animation. Suspend frames when the illustration is offscreen or the document is hidden. Reduced motion starts at the completed scene; enabling it during playback completes the sequence immediately. Explicit replay opts into motion. Disabling reduced motion alone never restarts playback.

Without JavaScript, the inline SVG and HTML show the completed example and controls remain hidden. Navigation and the coverage disclosure still work.

## Claims

- The user writes the example rule. Do not present it as built-in protection.
- Keep "Illustrative opt-in enforcement. Observe mode only reports." beneath the CTA.
- Blocking is one illustrative assessment, not a guarantee of database protection or universal interception.
- Do not imply that TENET hooks physical keyboards, restores deleted data or inspects subprocesses.
- Preserve the coverage and recording disclosure, including local evidence, possible code or secrets, and the recording opt-out.
