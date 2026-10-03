# Proposal

## Why

Tenet's README is about 7,300 words and mixes setup steps with technical internals. Readers need short, plain-English guides they can scan, and a lasting writing standard so future docs stay readable.

## What Changes

- Make the README a short starting point with clear links for installing Tenet, writing rules, checking findings, fixing setup, and building integrations.
- Simplify all current user and developer guides, including website documentation. Use task headings, short paragraphs, numbered steps, copyable examples, expected results, and small diagrams where they help.
- Move detailed settings and contracts into linked reference pages. Keep safety warnings beside the actions they affect and retain every material limit.
- Add one documentation writing guide. Link it from `AGENTS.md` with an explicit instruction to read and follow it when creating or editing documentation, and from `CONTRIBUTING.md` for human contributors.
- Add a short review checklist that applies to future documentation changes. Prefer a manual review over new linting tools or arbitrary readability scores.
- Keep completion notes in task comments or the final reply by default. The writing guide must allow repository handoff files only when the user explicitly requests one or the approved task requires one. Reserve `docs/` for maintained user and developer guides and references.
- Preserve exact commands, API names, policy syntax, recorded assessment meanings, and supported versus experimental status. Explain technical terms without renaming identifiers.
- Keep historical handoffs, existing OpenSpec records, license texts, third-party notices, policy files, and executable examples unchanged. This change does not alter runtime behavior.

## Capabilities

### New Capabilities

None. This is a documentation-only change, with `skip_specs: true`. The future writing standard belongs in contributor instructions, not an invented runtime capability.

### Modified Capabilities

None. Existing policy, approval, recording, and host contracts stay unchanged.

## Impact

- `README.md`, current guides under `docs/`, and `site/docs.html`.
- Current project, security, contribution, plugin, evaluation, and inspector-test guides. Historical evidence and evaluation claims retain their original meaning.
- New focused policy, inspector, configuration, limits, and documentation-writing pages, with short pointers from `AGENTS.md` and `CONTRIBUTING.md`.
- Documentation links and archive-facing guides. The production archive has a closed documentation list, so shipped guides must remain usable without new unshipped references.
- No new dependencies, public API changes, evaluator calls, deployments, or source-code changes are planned.
