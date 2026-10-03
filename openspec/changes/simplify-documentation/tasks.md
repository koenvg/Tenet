# Tasks

## 1. Keep future docs readable

- [ ] 1.1 Create `docs/writing-guide.md` with the writing rules, a before-and-after example, and a short review checklist. Verify it covers plain English, task-first structure, short paragraphs, useful examples and visuals, expected results, accurate warnings, linked references, and the default of keeping completion notes in task comments or replies. Verify repository handoff files require an explicit user request or approved task requirement.
- [ ] 1.2 Add a mandatory pointer in `AGENTS.md` to read and follow the writing guide before creating or editing documentation. Verify the link resolves, the trigger covers both new and changed docs, and existing project instructions remain intact.
- [ ] 1.3 Add the same guide link and a required documentation-review step in `CONTRIBUTING.md`. Verify human contributors can find the checklist and the full standard exists in only one authoritative place.

## 2. Shorten the main reader path

- [ ] 2.1 Extract policy writing and policy-management details into `docs/policy.md`. Verify every material grammar rule, numeric limit, threshold rule, integrity warning, and example meaning from the current README remains covered; keep active policy files unchanged.
- [ ] 2.2 Extract findings, inspector use, and recording management into `docs/inspector.md`. Verify the guide distinguishes findings, permission, and execution; includes capture and deletion warnings; and explains the Pi and standalone launch paths with expected results.
- [ ] 2.3 Create `docs/configuration.md` from the README's configuration reference. Verify exact variable names, defaults, valid ranges, restart requirements, and mode-specific invalid-setting behavior against the current implementation.
- [ ] 2.4 Create `docs/limits.md` for disclosure, approval, assessment, recording, and host limits. Verify all material safety caveats are retained, historical contracts remain interpretable, and no sandboxing or stock authenticated-action coverage is claimed.
- [ ] 2.5 Rewrite the README as a short entry point, aiming for at most 600 prose words. Verify it links directly to each reader task, labels checkout setup separately, keeps the essential privacy and observe-mode warnings visible, and accounts for each removed section in the new guides or existing references.
- [ ] 2.6 Simplify `docs/INSTALL-ARCHIVE.md` and `docs/ARCHIVE-OPERATION.md`. Verify installation, status checks, updates, removal, and warnings are scannable; check all required links against their archive destinations, where they become `README.md` and `docs/operation.md`.

## 3. Simplify integration and reference guides

- [ ] 3.1 Rewrite `docs/sdk.md` with a short starting example and linked detail. Verify exports and API contracts are unchanged, the copied guide works in the archive, and `bun run sdk:example` passes offline without editing executable examples.
- [ ] 3.2 Rewrite `docs/doctor.md` around running the command, understanding its result, and fixing setup. Verify states and exit codes remain exact, examples use the delivered compiled CLI path for archive and checkout installations, and readiness is not described as verified hook activation or provider connectivity.
- [ ] 3.3 Simplify `docs/claude-code.md`. Verify setup and owner-control steps are clear, prototype and unverified-host warnings stay visible, and neither Pi installation nor enforce mode implies Claude coverage.
- [ ] 3.4 Simplify `docs/assessment-contract.md` and `docs/action-resolution.md`. Verify contract versions, response-validation gates, authenticated-fact requirements, and unsupported-host behavior are preserved; explain the relationship with a small diagram and text summary.
- [ ] 3.5 Simplify `docs/shared-runtime.md`, `docs/inspection-evidence.md`, and `docs/cross-host-recordings.md`. Verify each page starts with its purpose and reader task, preserves lifecycle and attribution requirements, and distinguishes missing evidence from a passing assessment.

## 4. Apply the standard to the remaining guides

- [ ] 4.1 Update `site/docs.html` with clear task links, short explanations, and a useful example or flow visual. Verify existing titles, navigation, styles, and scripts remain intact; run `node site/smoke.mjs <local-site-url>` against a local server using the documented serving setup.
- [ ] 4.2 Simplify `docs/DEPLOYMENT.md` and review `site/DESIGN.md`. Verify deployment steps and checks are easy to find, current commands remain accurate, and no deployment or service restart is performed during this writing change.
- [ ] 4.3 Review `PRODUCT.md`, `DESIGN.md`, and `SECURITY.md` against the writing guide, simplifying only where useful. Verify product claims, design constraints, private security-reporting details, and existing scope remain unchanged.
- [ ] 4.4 Simplify `bb-plugin-tenet-status/README.md` and `inspector/tests/README.md`. Verify prerequisites, commands, expected results, and coverage limits are clear and match the current scripts and integrations; keep plugin skill files unchanged.
- [ ] 4.5 Simplify `eval/README.md`, `eval/semantic-README.md`, `eval/publication-demo-README.md`, and the live evidence-selection guide. Leave recorded campaigns, reports, checkpoints, and fixtures unchanged. Verify all historical dates, measurements, denominators, and result limitations are unchanged, and separate authorization warnings precede every live-provider or publication path. Run no live evaluations or remote actions.

## 5. Check the whole documentation set

- [ ] 5.1 Check local file links and heading anchors across all changed guides, including inbound links from unchanged historical docs. Verify links resolve or retain a useful target without rewriting historical records; simulate archive links using the existing closed document mapping.
- [ ] 5.2 Review every changed guide with the new checklist and compare the moved README content against its original sections. Verify readers can find an action, follow it, check the result, and see the relevant warning; confirm no material fact or exact contract requirement was lost.
- [ ] 5.3 Confirm the final diff is documentation-only and the future standard is reachable from both contributor entry points. Verify runtime source, package metadata, policy files, executable examples, licenses, notices, historical handoffs, and existing OpenSpec records remain unchanged; validate this change with `openspec validate simplify-documentation --type change --strict`.
