## Why

The current TENET selection menus expose concerns but cannot show the exact questions and evidence behind a rule assessment. Owners need to debug false blocks and missed violations across live and historical sessions without reconstructing requests from changed code or policy files.

## What Changes

- Add a standalone local Svelte + Vite inspector with a local backend, independent of the Pi process, covering all projects with project filtering and session-ID-based navigation.
- Record every assessment attempt by default, including passes, with submitted questions and choices, bounded submitted evidence, policy snapshots, responses, validation outcomes, deterministic gates, permission and observed execution.
- Persist recordings per session ID across restarts; support live updates and historical browsing without requiring the inspector to run during capture.
- Present rule violations, uncertainty, low confidence, approval requirements and unavailable assessments distinctly. Explain TENET's decisions without inventing model rationale.
- Keep the inspector read-only and archive failures independent of enforcement. Retain native Pi approvals and existing owner menus.
- **BREAKING** privacy/default change: local archives now retain submitted evidence by default, which may contain source code or secrets embedded in strings. Preserve evaluator-side redaction, exclude transport credentials, provide a capture opt-out, and document storage and removal.

## Capabilities

### New Capabilities

- `decision-recording`: Default-on, session-scoped persistent capture of evaluator inputs and decision lifecycle, with explicit completeness and failure reporting.
- `decision-inspector`: Standalone local cross-project session browser, call timeline and rule-level evidence inspection with live updates.

### Modified Capabilities

- `configurable-policy-enforcement`: Amend safe diagnostic payload requirements to permit a separate local evidence archive while preserving narrow agent-visible diagnostics and unchanged enforcement.

## Impact

- Extend request submission and validation in `src/decision/jev.ts`, with exact input construction from `questions.ts` and `judge-evidence.ts`; connect lifecycle identities and outcomes from `src/pi/guard.ts`.
- Add isolated recording/storage and read-only server modules plus a Svelte frontend. Add Svelte/Vite build dependencies and standalone launch/build commands; preserve the existing Bun/Node-supported Pi extension path.
- Extend config, owner reporting of capture health, SDK transport tests, owner-only integration tests, persistence tests and frontend/server tests.
- Update README privacy and operation guidance. Existing session records remain supported and are not retroactively treated as full evidence recordings.
- Explicitly supersedes the main spec's prohibition on new request logging only for the separate local archive. Preserve the owner-only boundary in the completed, unarchived observe-mode change: no archive data enters agent messages, tool output or evaluator trajectory.
