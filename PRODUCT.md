# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The planned decision inspector is a web interface. TENET's existing policy guard runs as a Pi extension with native terminal menus.

## Users

Developers reviewing their coding agents' policy decisions. This record currently covers all of TENET, including the guard and planned decision inspector.

## Product Purpose

TENET evaluates agent tool calls against owner-defined policies. The decision inspector helps owners debug false blocks and missed violations by inspecting the questions, submitted evidence, assessment results, and deterministic decision gates.

## Operating Context

The existing TypeScript guard runs inside Pi. It defaults to observe mode, reporting findings without blocking calls or requesting approval. Enforcement requires an explicit process-level opt-in.

The planned Svelte/Vite inspector runs locally, independently of Pi, with cross-project filtering, session navigation, live updates, and historical browsing.

## Capabilities and Constraints

- Keep the inspector local and read-only. Approval controls remain in Pi.
- Distinguish violations, uncertainty, low confidence, approval requirements, and unavailable assessments.
- Show recorded evidence and decision mechanics without inventing model rationale.
- Keep owner findings and archived evidence out of agent messages, tool results, and subsequent evaluator evidence.
- Treat semantic evaluation as fallible, not as an OS sandbox or a guarantee of safety.
- The inspector and persistent evidence archive are planned capabilities, not shipped functionality in this checkout.
- Planned archives may contain source code or secrets embedded in submitted evidence. Their privacy implications, capture opt-out, storage, and removal must remain explicit.

## Evidence on Hand

- `README.md` describes current guard behavior, operation, and limitations.
- `openspec/changes/add-standalone-decision-inspector/` contains the planned inspector and recording requirements.
- `test/` and `eval/` contain verification and evaluation material. Offline enforcement tests do not establish semantic accuracy.

## Product Principles

- Help owners understand incorrect decisions using the evidence actually submitted.
- Keep inspection separate from authorization and enforcement.
- Make unavailable or incomplete evaluations visible rather than presenting them as an all-clear.
- Preserve the distinction between proposed capabilities and verified behavior.

## Open Decisions

Product-specific accessibility requirements have not yet been established.
