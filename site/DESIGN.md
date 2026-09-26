---
name: TENET marketing
description: Quiet editorial space for owner-written AI tool-call policies
colors:
  ink: "#171717"
  paper: "#fff"
  muted: "#62666b"
  rule: "#d7d9da"
typography:
  display:
    fontFamily: 'Geist, "Helvetica Neue", sans-serif'
    fontSize: "clamp(56px, 4.5vw, 72px)"
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: "-.037em"
  body:
    fontFamily: 'Geist, "Helvetica Neue", sans-serif'
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  action: "100px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.action}"
    padding: ".6em 1.5em"
---

# Design System: TENET marketing

This file applies to `site/` only. The repository-root `DESIGN.md` documents the separate inspector.

## Overview

**Creative North Star: "Editorial space"**

A white field, near-black type, measured hairlines, and one concrete assessment do the work. The approved split composition gives the promise and action room to breathe; the example is evidence, not a dashboard or decorative object. Keep the claims as restrained as the page.

**Key Characteristics:**
- White field, near-black type, and measured hairlines.
- One unframed product example instead of decorative imagery.
- A split first viewport that becomes a quiet reading column on mobile.

## Colors

Ink carries headings, body text, and the primary action. Paper is the sole page background. Muted text labels supporting facts; pale rules separate sections and the assessment. No accent color or shadow is used.

## Typography

Geist is self-hosted. The light display weight gives the headline room without making it loud; ordinary text uses regular weight. Code samples use the platform monospace stack so the rule syntax stays legible. The wordmark alone uses tracked uppercase lettering.

## Layout

At widths above 1100px, the first screen is a split field: left headline and actions, right unframed assessment. It fills the viewport but never shrinks below 700px, so short desktop windows cannot push the action into the qualifier or next section. At 1100px the hero becomes normal flow; at 700px the explanation becomes one column. Outer gutters stay at 6.2% and the mobile assessment follows the action. The docs use the same whitespace and hairline rhythm.

## Elevation & Depth

Flat by design. Hierarchy comes from spacing, scale, and thin rules, not cards, shadows, or glass effects.

## Shapes

The primary action is a dark pill. Other elements are unframed text or straight horizontal rules.

## Components

- **Primary action:** near-black fill, white type, 100px radius; darkens slightly on hover.
- **Text action and navigation:** no default underline; show one on hover. Keyboard focus has a visible dark outline.
- **Assessment:** a single top rule, muted label, three plain-text facts, then the opt-in qualifier. It is explicitly illustrative.
- **Motion:** the example's top hairline draws once in 560ms; the text stays visible from the start. With reduced motion the line is static. Anchor scrolling and link-arrow feedback stay small, and reduced motion removes their movement.

## Do's and Don'ts

- **Do** preserve a readable product example and explicit mode distinction.
- **Do** keep mobile copy in normal flow with no horizontal scrolling.
- **Don't** imply that observation blocks or asks approval.
- **Don't** add a decorative illustration, card grid, or faux inspector panel to this marketing surface.
