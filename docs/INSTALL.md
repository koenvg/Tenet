# Install Tenet from a stable checkout

Use this guide to install Tenet for Pi owners. Clone a persistent checkout, install locked dependencies with Bun, and build the SDK and inspector before registration. You do not need to write SDK code, register tools or run a bridge.

Choose a commit with passing application CI. Keep its checkout at a stable path while Pi uses it. Tenet does not provide a production tarball or a published npm package.

## Install once in a stable directory

You need Git, repository access, Node 22.19+, Bun 1.3.14+ and a separate Pi installation. The tested host is `@earendil-works/pi-coding-agent` 1.3.0. SDK-only use supports Node 22.12+ or Bun 1.3.14+ without Pi. Cloning and dependency installation need network access or cached data; the builds make no judge requests.

Before installation, registration or installed extension replacement, obtain separate authorization. Live-capable Tenet sends full policy, paths and selected evidence to the selected judge. Strings can contain secrets despite redaction.

Official TypeSafe uses quota. Custom hosted System One costs depend on its operator. Kev or experimental APUS through owner-operated forwarding can send these strings to Pika.

The owner controls Pika logging, access and retention. Local capture is on by default. `TENET_RECORDING=off` stops neither provider disclosure nor provider and backend logs.

Installation approval does not authorize a service, tunnel, owner settings edit, evidence submission or enforcement.

1. Choose an unused persistent directory you own, not a disposable worktree or temporary download folder. Replace `replace-with-verified-commit-sha` with the commit you reviewed and checked in CI:

   ```sh
   TENET_DIR="$HOME/Applications/tenet"
   TENET_REV=replace-with-verified-commit-sha
   mkdir -p "$HOME/Applications"
   git clone --no-checkout https://github.com/koenvg/Tenet.git "$TENET_DIR"
   cd "$TENET_DIR"
   git checkout --detach "$TENET_REV"
   ```

2. From that checkout, install its locked dependencies and build the runtime and inspector:

   ```sh
   bun install --frozen-lockfile
   bun run sdk:build
   bun run inspector:build
   ```

   Each command must exit zero. Check that `dist/cli/index.js`, `dist/sdk/index.js` and `inspector/dist/index.html` exist. If installation fails, restore registry access or its cache and rerun the same locked install. Do not register a partial build.
3. Register the stable path with Pi:

   ```sh
   pi install "$TENET_DIR"
   pi list
   ```

   Use user-level registration without `-l`. Check that `pi list` shows the stable path. Pi loads it in place; it does not copy the directory or install dependencies. Keep the checkout, dependencies and built output available.
4. Close all running Pi processes before loading the registered version. Do not also load this extension with `-e` or `bun run pi`. `/reload` and `/new` can retain old module imports and do not replace a full restart.

No global `tenet` binary is installed. Run doctor through the compiled CLI below. The checkout's `TENET.md` is test data, not your owner policy. Start Pi from the project you intend to assess, not from the installation directory.

## Per-project setup before any assessed action

Complete these steps for each session project, including a project that uses only global rules. Use the later enforcement, SDK, update and rollback sections only when needed.

Before launching Pi, review these limits:

- The selected judge receives full policy text, identity/paths, field-redacted tool arguments and metadata, and bounded observations. TypeSafe uses quota; APUS through private forwarding sends these to Pika and uses CPU. Source, commands, URLs and rule text can retain secrets despite redaction. Backend log access and retention are the owner's responsibility.
- Local capture is on by default. It saves submitted strings in `~/.tenet/recordings`. This is best-effort, unencrypted same-user storage, not protection against an agent running as you.
- Observe never vetoes or opens approval. Tenet is not an OS sandbox, and actions outside Pi's hooks are not covered. Pi installation does not verify the Claude Code prototype.
- Optional owner-home `~/.tenet/TENET.md` activates projects without local rules. Global rules can reach TypeSafe and recordings in every eligible session. An invalid global file makes the complete policy set unavailable, even with a valid project file. Review these effects before authoring it.

1. Before provider or owner settings changes, obtain separate authorization for full policy/selected-evidence disclosure to that service, with the quota/CPU, capture and backend-log risks above. TypeSafe is the absent-settings default and requires `TYPESAFE_API_KEY` through your secret manager in the launch shell. Never put it in policy, source, chat or command arguments.

   APUS needs no TypeSafe key; follow the [private Pika setup and settings guide](judge.md#plan-private-pika-setup) only with separate service, tunnel and owner-file authorization. Doctor reads process environment, not dotenv files or a secret manager.
2. If you do not want new local capture, set this before launching:

   ```sh
   export TENET_RECORDING=off
   ```

   This does not prevent provider disclosure, stop provider and backend logs, disable observation or native findings, or delete old records. Omit it to retain evidence for the inspector.

   Before writing owner policy, obtain separate authorization. Future assessment discloses full policy and selected evidence to the selected service, with possible secrets despite redaction, service-dependent costs, default capture and owner-controlled backend logs. Capture-off stops neither disclosure nor all logs.

3. Review the intended rules first. Author the optional `~/.tenet/TENET.md`, the project's `TENET.md`, or both yourself in an editor or owner shell, outside the guarded agent's intercepted path. Create the global file only if you want its rules across projects.

   Tenet never creates it automatically. For example:

   ```tenet-policy
   Rule; Ask before overwriting owner-demo.txt.
   ```

   This illustrative local rule is not a complete security policy. Review your own rules. Do not ask the guarded agent to migrate or weaken its active policy.

`Rule; text` is the supported short form, with default severity `BLOCK`. It can require approval or prohibit an action. Each declaration is one physical line beginning with case-sensitive `Rule;`.

Explicit `BLOCK`, advisory `WARN` and per-rule metadata are optional choices in [the rule reference](operation.md#write-one-line-rules). Plain prose is not enforced. A declaration inside a Markdown fence is still active.

Tenet selects optional `~/.tenet/TENET.md` from the process owner's home alongside `TENET.md` in the session working directory. `TENET_POLICY` selects an absolute or session-relative project file instead of the local candidate; it never replaces global. There is no global-path override, opt-out, parent search or installation-directory fallback.

Only confirmed absence of both implicit candidates without an override makes both modes dormant. Any present source must validate. Empty overrides, missing explicit files and unusable sources make the whole set unavailable, not a valid-subset pass. Observe permits without a pass; enforce blocks. The sources share 64 KiB of file bytes and 16 declarations, with 4096 UTF-8 bytes per rule. See [policy selection and limits](operation.md#eligibility-and-owner-control).

### Check setup offline

Run from your project, in the same shell environment the next Pi process will inherit. Replace the project placeholder. `TENET_DIR` must still name the stable installation:

```sh
cd /absolute/path/to/your/project
node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD"
node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD" --json
```

Bun can run the same compiled CLI. Doctor checks the installation containing that CLI and both owner-home and session project candidates. It sends no evidence and changes no files.

`ready` means local prerequisites are valid. Hooks, credential validity and provider connectivity remain unverified. Fix invalid or unavailable setup before launch. `off` and `dormant` are bypass states, not passing assessments. See [doctor states, exits and limits](doctor.md).

Check global and project roles, configured paths, resolved targets, each file digest, combined digest and total rule count. Absent optional candidates remain listed.

Doctor schema 3 also identifies the effective canonical project's judge origin, transport, authentication mode, setting provenance and limits. Anonymous System One and APUS credentials are not-required. An invalid selection is unknown, never a fallback.

Pi startup and status use the frozen current session snapshot; restored owner details use recorded facts, with missing historical destinations not recorded.

After any policy-only change, reload through Pi session start or restart and check these values again. Active source changes invalidate the whole snapshot; off/on does not refresh it. Code or environment changes require a full restart.

SDK hosts close and reopen sessions; the Claude prototype uses bridge reselection and matching hook configuration, not Pi commands.

## Restart, observe and inspect findings

Before live-capable launch or evidence submission, obtain separate authorization for the selected service and exact full policy/selected evidence. They can contain secrets despite redaction. TypeSafe uses quota; Pika uses CPU and can keep owner-controlled backend logs.

Default local capture retains submitted strings; capture-off stops neither disclosure nor all logs. Do not use installation consent as live evaluation consent.

1. Start a fresh process from your project. Select observation explicitly so an old shell override cannot select enforcement:

   ```sh
   TENET_MODE=observe pi
   ```

   Before `/tenet on`, obtain separate activation authorization. It enables full policy/selected-evidence disclosure to TypeSafe or Pika, with possible secrets despite redaction, quota/CPU cost, local capture and backend logs. Capture-off stops neither disclosure nor all logs.

2. Check `TENET ON OBSERVE`, then run `/tenet status`. If a prior shared choice is off, `/tenet on` restores this process's observation mode. It does not select enforcement.

3. Use bare `/tenet` to browse owner findings, including rule locations and score gates.

Observation releases calls after bounded evidence capture, then assesses a fixed snapshot in the background. Findings can arrive after the tool result or turn. They are owner-only, not agent messages or later judge evidence.

Real assessed actions contact the selected judge. There is no production mock or cross-provider fallback. Do not publish code or cause a destructive effect to check setup. The separately authorized [full-payload observe plan](judge.md#plan-a-separately-authorized-full-payload-observe-evaluation) uses actions as inert data, not executed fixtures.

Pending, cancelled, dropped or unavailable assessment is not an all-clear. A released call does not prove execution, and stock Pi results do not establish exact invocation correlation. For missing commands or findings, see [troubleshooting](operation.md#troubleshooting).

## Opt into enforcement later

Before relying on enforcement, understand its limits. Pi cannot freeze arguments after hook release, correlate native results exactly, inspect subprocesses or supply stock authenticated action targets. Later hooks or executors may change an action.

An untested host is not verified coverage; Claude Code remains an unverified prototype outside this setup path.

Before selecting enforcement, obtain separate activation authorization. It sends full policy and selected evidence to TypeSafe or Pika, with possible secrets despite redaction, quota/CPU cost, default capture and owner-controlled backend logs. Capture-off stops neither disclosure nor all logs. APUS remains experimental; Q8 and normalized scores do not establish enforcement safety.

1. Close Pi and start a new process from the project:

   ```sh
   TENET_MODE=enforce pi
   ```

2. Check `TENET ON ENFORCE` with `/tenet status`.

Enforce waits for assessment and, when required, native owner confirmation for one unchanged pending invocation. Denial, dismissal, missing UI or stale authorization withholds it. A prohibition or unavailable assessment blocks without an approval override. `WARN` remains advisory.

On/off is a cooperative machine-wide assessment and capture switch. Mode is fixed for each process. `TENET_RECORDING=off` disables only local capture.

Already released calls cannot be recalled; other processes notice off asynchronously. Same-user processes can change control state. These are not OS security controls.

## Inspector and SDK

Retained evidence can contain secrets. The inspector is read-only and unauthenticated on loopback. Do not expose or proxy it to another machine.

Before starting either inspector service, obtain separate authorization. It reads retained full policy and selected evidence, which can contain secrets despite redaction, and exposes them to same-user loopback readers. It makes no judge request, but existing provider logs and local records remain. Capture-off does not erase them or prevent future provider disclosure/all logs.

1. In an eligible Pi session, run `/tenet-inspector`. It starts the built local inspector and attempts to open Arc on macOS. If it cannot open Arc, use the printed loopback URL yourself.
2. To inspect retained records after Pi exits, run from the installation:

   ```sh
   cd "$TENET_DIR"
   bun run inspector:serve
   ```

   For another archive directory, use an actual absolute path:

   ```sh
   TENET_RECORDING_DIR=/absolute/private/records bun run inspector:serve
   ```

3. Open the printed URL, select a session and call, and inspect its recorded stages. Stop the standalone server with Ctrl-C.

No frontend rebuild, Pi or TypeSafe credential is needed. Recording opt-out leaves native findings but no new archive. Missing stages, unsupported schemas and partial indexing remain unknown, not passes. See [disclosure and storage limits](operation.md#disclosure-and-limits).

Embedding applications can use the compiled ESM SDK and declarations from this built checkout. See [the alpha SDK setup and contract](sdk.md). Keep the checkout's build and dependencies available to consumers.

## Removal and rollback

Removing loading does not delete old evidence or undo released actions.

Before removal, upgrade or rollback changes to the installation or owner files, obtain separate authorization. Future active launches send full policy and selected evidence to TypeSafe or Pika, with secret-bearing strings despite redaction, quota/CPU cost, capture and backend logs. Capture-off stops neither disclosure nor all logs. Removing loading disables assessment, not old evidence or remote effects.

For provider rollback rather than package replacement, use [valid TypeSafe settings and credential rollback](judge.md#roll-back-the-selected-provider-only-after-approval), then fully restart. Do not remove only the provider field or expect a running guard to reread it.

1. Remove the same path you registered:

   ```sh
   pi remove "$TENET_DIR"
   pi list
   ```

2. Check that the path is absent, then close and restart Pi.
3. Stop any standalone inspector before deleting the stable installation directory.

Off and uninstall leave `~/.tenet/recordings`, Pi's own session files and `~/.tenet/control.json`. Stop all writers and readers before separately removing retained evidence. There is no automatic recording expiry. Removing control resets the cooperative choice and lets fresh processes default to on.

For an upgrade or rollback:

Older releases can ignore automatic global discovery and cannot reproduce additive enforcement. Keep the new version, or first author and review a complete policy selected for every affected session outside the guarded path. Check the target release's override support and native status; do not assume `TENET_POLICY` restores ignored global rules. Rollback does not add compatibility or rewrite historical evidence.

Policies remain owner-managed. Older versions may ignore observe mode or `WARN`/threshold metadata and block by default. Remove per-rule threshold metadata externally before reverting to a version that treats it as prose. See [policy migration](operation.md#owner-only-policy-management).

A pre-SDK version removes the alpha SDK entry, so embedding consumers must not expect the import to survive. Historical evidence keeps its recorded contract versions. Rollback neither migrates nor erases it; older inspectors may support only a subset.

1. Preserve the current checkout and build as a rollback option. Close all Pi processes and the inspector. Review the target version's grammar, controls and mode defaults before relaunching. Do not reset a shared tree or overwrite unrelated edits.
2. Prepare a separate stable checkout at the desired verified commit. Follow the clone, locked Bun install and build steps above with a different unused path. For rollback, use the separately preserved, verified previous checkout and its build. Use the target version's own setup instructions if its build commands differ.
3. Run the target version's offline diagnostics before registration. Keep the old installation registered if preparation fails. Once the target is ready, remove the old path with `pi remove`, register the new path with `pi install`, and confirm with `pi list` that only the intended Tenet path remains. Set `TENET_DIR` to that path for later commands.
4. Before guarded work, verify the selected complete policy in each affected session with the target version's supported diagnostics. For this version, [run doctor offline](#check-setup-offline), restart Pi and check `/tenet status`. An older version may lack these diagnostics; do not assume readiness or additive enforcement from registration alone. Preserve owner settings, policies and recordings.

## What the checkout checks prove

Developers and CI run the [offline validation lane](../CONTRIBUTING.md#check-a-change). Its `bun run delivery:check` step builds fresh SDK declarations and inspector assets in a disposable checkout-shaped installation. It reuses installed dependencies without registry downloads.

Node and Bun consumers exercise SDK imports, doctor, configuration and recorded reports. TypeScript checks public declarations.

The built inspector serves synthetic findings and assets over loopback. Pinned Pi discovery, dispatch, registration and removal run with temporary process homes and synthetic credentials, not owner settings.

Global-only, combined and project-override scenarios use session directories, never installation policies. Empty or malformed global sources, broken global links, missing explicit projects and blank overrides reject the whole set.

The owner recipe tests doctor text and JSON and fresh observe/enforce processes. A scripted judge and assistant exercise only a disposable local file.

Observe releases a write and later shows its counterfactual `BLOCK` finding. Enforce tests `PASS`, denied and approved native confirmation, and `FAIL` through actual executor counts.

Checks also parse the maintained judge settings examples, test APUS identity and readiness, trap import/doctor side effects, and exercise native requests with scripted transport. Provider failure and invalid settings never fall back to TypeSafe.

Removing the registered extension retains the fixture policy and historical evidence. Capture opt-out creates no new recordings.

These checks make no live evaluator requests. They prove local installation and dispatch mechanics, not semantic accuracy, provider connectivity, a sandbox or verified Claude coverage.
