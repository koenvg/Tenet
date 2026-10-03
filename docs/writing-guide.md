# Write and review Tenet documentation

Use this guide before creating or editing user or developer documentation. It is the authoritative writing standard for new or changed Markdown and website docs, including readable explanations in technical references.

Apply it to the text you change. Existing historical records, handoffs, OpenSpec records, legal text, policy files, and executable examples are out of scope. Preserve required protocol syntax and exact contracts.

## Plan the reader's task

Start with what the reader can do and the next action. Name the intended reader and the installation or host the page covers. Put background after the steps or in a linked reference.

For a task guide, use this order. Omit a part only if it does not apply.

1. State the task and its scope.
2. Give prerequisites and safety warnings.
3. Give short, numbered steps with commands or examples.
4. State the expected result and how to check it.
5. Give common fixes and links to exact details.

Start a reference page with a short explanation of what the reader can look up and when to use it. Keep complete contract details under descriptive headings. Shorter prose must not remove a requirement or limit.

### Separate first use from optional branches

Give the ordinary task a complete path before parser exceptions, tuning, internals or historical contracts. Start a policy example with the supported short form `Rule; text`, which defaults to `BLOCK`. Disclose explicit severity, `WARN` and per-rule metadata when the reader needs those choices.

Use this order of importance:

1. Keep required actions, warnings and completion checks in the task steps.
2. Group a definition with its rules and caveats under one reference heading.
3. Link branch-only detail to an existing maintained reference. State when to follow the link, not just the page title.

A shorter paragraph does not fix a buried task. Move optional detail below the task or behind a specific link. Keep one authoritative explanation; repeat only the essential warning needed to make each risky path safe. A complete contract reference can remain long if readers can reach the relevant section directly.

Agent-facing pointers need an explicit trigger, such as creating or editing documentation. Keep the standard in this guide rather than copying it into every entry point. Remove unnecessary environment inventories from agent instructions, but keep usable commands, prerequisites and expected results in human setup guides.

## Write in plain English

Use familiar words and active voice. Explain a necessary technical term on first use, but keep its exact identifier. Say what a component does, not that it is powerful or flexible.

Keep one idea per paragraph, usually in one to three sentences. Split a dense sentence rather than making the reader read it twice. Remove filler and repeated explanations.

Use sentence-case task headings, such as "Install the archive" or "Check a finding". For troubleshooting, use the symptom, such as "No Tenet status appears". References can use descriptive headings for the settings or contracts they explain.

Use numbered lists when order matters. Use bullets for choices or facts. Make each step an action the reader can complete. Put the command, warning, and result beside the step they explain.

## Show steps and results

Give a useful, copyable example where it helps the reader perform the task. State the working directory, prerequisites, and any placeholder values they must replace. Use fenced code blocks with a language label. Keep commands separate from their output and omit shell prompts from copyable commands.

Label the example's scope and status. Say whether it runs offline or makes live requests. State whether the documented path is supported, experimental, or unverified for the named host and installation. Use a nearby sentence or label, not an assumption buried elsewhere.

Prefer offline examples for learning and validation. A live example must identify the external service, data sent, and possible quota or cost. Put any separate authorization requirement before the live command. A copyable command is not authorization to run it.

State what success looks like and how to check it. Give relevant output, a state, an exit code, or another observable result. Explain common failures and the next action. Do not describe an offline check as proof of live provider connectivity or active host hooks.

Use a small diagram when a flow or relationship is easier to see than read. Add a short text explanation so the meaning does not depend on the visual. Use ordinary text or existing local assets without a new renderer or remote dependency. For website images, include useful alternative text. Skip decorative visuals.

## Put warnings beside risky actions

Put an accurate warning before the step that can cause harm, disclose data, spend quota, or change permissions. Say what can happen, which action causes it, and what the reader must do. Link to details after the essential warning, not instead of it.

Keep every material safety limit visible where it matters. This includes provider disclosure, secret-bearing recordings even with redaction, observe mode not blocking execution, approval for one call, unsupported host coverage, and lack of sandboxing. Include the limits relevant to the page, not an unrelated warning list on every page.

Keep findings, permission, and observed execution distinct. An assessment does not by itself prove that a tool ran. Missing evidence is not a passing assessment. Enforce mode or installation in one host does not establish coverage in another.

## Link to exact details

Explain the immediate task here. Link to one maintained reference for detailed settings or contracts instead of copying the reference into several guides. Use descriptive link text so the reader knows what they will find.

Preserve exact commands, paths, API names, environment variables, policy grammar, numeric limits, defaults, contract versions, and validation gates. Explain these in plain English without renaming them or changing their meaning. Keep historical claims, dates, measurements, and denominators accurate.

When moving text, account for every material fact and warning in its new location. Keep important heading anchors where practical and check current inbound links when an anchor changes. Leave historical records unchanged.

Check links in the context where readers use the page. A checkout-only file is not an available archive reference. Keep shipped guides self-contained for required steps and warnings, and label repository-only development links. See the [archive installation guide](INSTALL-ARCHIVE.md) and [archive operation guide](ARCHIVE-OPERATION.md) for the delivered reader path.

## Keep completion evidence with the task

Put completion notes and validation results in task comments or the final reply by default. State what changed, which checks ran, and any limits there.

Create a repository handoff file only when the user explicitly requests one or an approved task requirement calls for one. Keep `docs/` for maintained user and developer guides and references. Existing historical handoffs stay unchanged.

## Compare a short rewrite

Before:

> The standalone SDK demonstration provides an illustration of lifecycle behavior through an injected judge, and contributors can execute the corresponding package script to facilitate verification of these scenarios.

After:

~~~~md
### Run the SDK example offline

Use this supported developer-checkout example to check SDK lifecycle behavior. It uses an injected judge and makes no TypeSafe requests.

1. Complete the [development setup](../CONTRIBUTING.md#set-up).
2. From the repository root, run:

   ```sh
   bun run sdk:example
   ```

The script builds the example and runs it under Node. Success prints a line that starts with `SDK example passed:`. If a dependency is missing, check the development setup first.
~~~~

The rewrite gives the reader an action, a copyable command, and a result they can check. It keeps the technical identifier and offline limit.

## Review every changed page

This is a manual review, not automatic enforcement or a readability score. Before submitting a documentation change, check every changed page against every item below. If an item does not apply, confirm why. Resolve failed items before handoff, and report any remaining validation limits in the task or final reply.

- [ ] The opening gives the reader a task or lookup purpose, scope, host, and installation context.
- [ ] A reader can complete the ordinary task before optional branches. Sentence-case headings expose the next action; troubleshooting headings name symptoms.
- [ ] Plain words and active voice explain necessary terms without changing identifiers. Dense sentences, filler, and repeated explanations are removed.
- [ ] Paragraphs have one idea and are short, usually one to three sentences.
- [ ] Prerequisites come before actions. Numbered steps show required order, and bullets show choices or facts.
- [ ] Useful examples are copyable. Code blocks have language labels, no shell prompts, a working directory, and explained placeholders. Output is separate from commands.
- [ ] Commands, paths, API names, and example results match the current implementation and scripts. Any checks not run are reported, not claimed as passed.
- [ ] Examples and procedures clearly state offline or live operation and supported, experimental, or unverified status for their host and installation.
- [ ] Live steps name the service, data disclosure, and quota or cost. Any separate authorization requirement appears before the command.
- [ ] Each task has an observable expected result, a way to check it, and useful next actions for common failures.
- [ ] Useful flows or relationships have a small visual and text explanation. Website images have useful alternative text. No visual needs a new renderer or remote asset.
- [ ] Accurate warnings appear before risky actions. Essential disclosure, recording, observe-mode, approval, coverage, and sandboxing limits remain visible where relevant.
- [ ] Findings, permission, execution, and missing evidence remain distinct. Offline checks do not claim live connectivity or active hooks.
- [ ] Exact syntax, numeric limits, defaults, contract versions, validation gates, and historical claims retain their meaning.
- [ ] Every moved material fact and warning has a destination. Historical records and excluded files remain unchanged.
- [ ] Definitions, rules and caveats are together. Branch-only details have descriptive links to one authoritative reference. Agent pointers state their trigger. Local files, heading anchors, and affected inbound links resolve.
- [ ] Links and required instructions work in the stated checkout, website, or shipped archive context. Repository-only links are labelled, and archive warnings remain self-contained.
- [ ] Completion notes and validation results go in the task or final reply. Any new repository handoff file has an explicit user request or approved requirement.
