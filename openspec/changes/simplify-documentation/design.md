# Design

## Context

See [proposal.md](proposal.md) for the reason and scope.

The current README is about 7,300 words. Thirteen central guides contain about 24,600 words, with some prose paragraphs exceeding 200 words. Setup instructions share space with score validation, recording internals, lifecycle rules, and historical work references.

`AGENTS.md` points contributors to `CONTRIBUTING.md`, but neither defines a documentation writing standard. A rewrite alone would leave future authors free to add dense text again.

The production archive copies `docs/INSTALL-ARCHIVE.md` to its README with rewritten links, `docs/ARCHIVE-OPERATION.md` to `docs/operation.md`, and the SDK and doctor references to the same paths under `docs/`. It includes the compiled offline doctor CLI but does not install a global `tenet` command. `scripts/delivery-contract.ts` accepts a closed file list. New checkout pages will not automatically ship in the archive.

A design is useful because this reorganization crosses several guides, changes their navigation, and must preserve safety information in both checkout and archive documentation. Runtime specs are deliberately skipped.

## Goals / Non-Goals

Goals:

- Readers can find the next action from headings without reading the whole page.
- Detailed contracts remain complete, with plain-English explanations and links from the relevant task.
- Human contributors and coding agents use one lasting writing standard for future documentation.

Non-goals:

- A new documentation platform, visual redesign, readability linter, or documentation generator.
- Changed runtime defaults, policy meaning, identifiers, dependency versions, or supported integrations.
- A forced word limit on technical references that would hide necessary details.

## Decisions

### 1. Separate tasks from reference

Make the README a starting point, aiming for no more than 600 prose words. Put a short description, material safety warnings, and task links before background detail.

```text
README
  |
  +--> Install ----------> docs/INSTALL-ARCHIVE.md
  +--> Write rules ------> docs/policy.md
  +--> Check findings ---> docs/inspector.md
  +--> Fix setup --------> docs/doctor.md
  +--> Build an app -----> docs/sdk.md
  |
  +--> Exact settings ---> docs/configuration.md
  +--> Limits and data --> docs/limits.md
```

Use the archive's direct offline doctor invocation for the owner setup check. Keep the checkout setup path as a clearly labelled developer option. Do not imply that installation adds a global `tenet` command.

Move the README's rule grammar and policy management into `docs/policy.md`; move inspector use and archive handling into `docs/inspector.md`; move environment settings into `docs/configuration.md`; move disclosure, approval, evidence, and host limits into `docs/limits.md`, linking to the existing detailed contracts where needed.

Before removing a README section, account for its material claims in a source-to-destination checklist. Reference pages also need short summaries and descriptive headings; moving a wall of text is not enough.

Keep current filenames where possible. Preserve existing heading anchors when practical, and repair links within the project when headings change. Historical handoffs remain untouched. Carry exact rule syntax, numeric limits, contract identifiers, validation gates, and caveats into their destination without changing their meaning.

A single shortened README was rejected because it would still mix different reader tasks. Deleting detail was rejected because readers need the actual contract and limits.

### 2. Put the next action first

Task guides should follow this shape, omitting sections that do not apply:

1. Say what the reader can do and which installation or host this covers.
2. Show necessary requirements and safety warnings.
3. Give short numbered steps, with copyable commands or examples.
4. Say what the reader should see and how to check it.
5. Give common failure fixes and links to exact details.

Use symptom headings for troubleshooting, such as "No Tenet status appears", rather than internal subsystem names. Distinguish observation findings, actual permission, and observed execution in examples.

Keep warning text beside risky steps. Provider disclosure, secret-bearing recordings, observe-mode non-blocking behavior, one-call approval, unsupported coverage, and lack of sandboxing must not be hidden behind optional links.

### 3. Make the writing standard permanent

Create `docs/writing-guide.md` as the authoritative standard for all new or changed user and developer documentation. It applies to Markdown and website documentation, and to readable explanations in future technical documents. Exact protocol syntax and legal text retain their required form. Existing historical records are not retroactively rewritten.

The standard must require:

- Start with the answer or next action. Assume the reader is scanning.
- Use familiar English and active voice. Explain a necessary technical term on first use while preserving its exact identifier.
- Keep paragraphs short, usually one to three sentences, with one idea per paragraph.
- Use sentence-case task headings, bullets for choices, and numbered lists for ordered steps.
- Add a copyable example and a way to check the result where useful. State whether it is offline, live, supported, or experimental.
- Use a small diagram for a flow or relationship that is easier to see than read. Give a short text explanation too. Visuals are useful aids, not mandatory decoration on every page.
- Link to detailed references instead of repeating them. Keep important warnings next to the relevant action.
- Remove repeated explanations and filler. Keep contractual details and limitations accurate.
- Put completion notes and validation results in task comments or the final reply by default. Create repository handoff files only when the user explicitly requests one or the approved task requires one. Keep `docs/` for maintained user and developer guides and references.

Include a short before-and-after example and a review checklist in that guide. Add a concise, mandatory pointer in `AGENTS.md`: before creating or editing documentation, read and follow the writing guide and check the changed docs against its checklist. Add a contributor pointer and documentation-review step in `CONTRIBUTING.md`. Keep the full standard in one place rather than copying it into both files.

The review checklist must ask whether the reader can find the task, follow the steps, check the result, understand the warning, and reach the exact reference. It must also check command accuracy, links, clear support status, and preservation of material facts.

This makes the standard part of the contribution process. It is manual review, not automatic enforcement or a guarantee that every future author will comply. Readability scores and new lint dependencies were rejected because they cannot judge accuracy or whether the next action is clear.

### 4. Cover the current guides without rewriting history

Apply the standard to the current guides in `docs/`, `CONTRIBUTING.md`, `PRODUCT.md`, `DESIGN.md`, `SECURITY.md`, `site/DESIGN.md`, the BB plugin README, evaluation READMEs, and inspector test instructions. Review already-short pages against the standard without changing them solely to create a diff.

Simplify the wording around historical evaluation results, but keep dates, measurements, denominators, authorization requirements, and claims unchanged. Do not rewrite archived reports, handoffs, existing OpenSpec changes or specs, policy files, license notices, skill files, or executable examples.

Update `site/docs.html` as a short web entry point to the same reader tasks. Preserve its existing layout, styles, and scripts. Use ordinary HTML and Markdown; diagrams must remain understandable without a new renderer or remote assets.

### 5. Keep archive guides self-contained

Keep installation warnings and essential operation details in the four Markdown guides already shipped. `docs/sdk.md` must remain usable when copied unchanged into the archive. Use links that work in both contexts, or clearly label repository-only development references as such.

Do not add mandatory archive links to the new checkout reference pages. This avoids changing the production file list or packaging scripts for a writing-only change.

## Risks / Trade-offs

- Shortening could remove a safety limit. Mitigate with the source-to-destination checklist and a final claim-preservation review.
- More focused pages could make navigation harder. Mitigate with direct task links, descriptive headings, and a small number of new pages.
- Changed headings could break old links. Mitigate by preserving important anchors and checking current inbound links without editing historical handoffs.
- Moving content could break archive docs. Mitigate by checking links against the shipped file set and keeping required warnings in shipped guides.
- Copyable examples could invite live requests. Mitigate by labelling live examples and retaining separate authorization gates. Verification uses no evaluator credentials or live calls.
- Future authors could ignore the standard. Mitigate with mandatory agent and contributor pointers and a concrete manual review checklist, without claiming automatic enforcement.

## Migration Plan

1. Add the writing guide and instruction pointers.
2. Extract complete reference content, then shorten the README and task guides.
3. Apply the same standard to remaining current guides and the website docs.
4. Check links, commands, archive document destinations, support claims, and preservation of safety details. Run applicable offline site and example checks only.
5. Publish the documentation changes together. No runtime migration or deployment is part of this change. A rollback restores documentation files only.
