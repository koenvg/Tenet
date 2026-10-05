# Install the Tenet production archive

Use this guide to install Tenet for Pi owners. The private archive has compiled code and built inspector assets. You do not need SDK code, tool registration or a bridge.

Obtain `tenet.tar.gz` from a passing `main` GitHub Actions build. The private artifact expires after 14 days. It is not an npm package or public release.

## Install once in a stable directory

You need Node 22.19+ with npm, Bun 1.3.14+ and a separate Pi installation. The tested host is `@earendil-works/pi-coding-agent` 0.85.1. SDK-only use supports Node 22.12+ or Bun 1.3.14+ without Pi.

Before installation, registration or installed extension replacement, obtain separate authorization. A live-capable Tenet installation sends full policy and selected evidence to the selected judge, TypeSafe or experimental APUS on Pika. Strings can contain secrets despite redaction.

TypeSafe uses quota; Pika uses CPU and can retain backend logs. Local capture is on by default. `TENET_RECORDING=off` stops neither disclosure nor all backend logs.

Installation approval does not authorize a service, tunnel, owner settings edit, evidence submission or enforcement.

1. Choose a persistent directory you own, not a disposable worktree or temporary download folder. Replace `/path/to/tenet.tar.gz` with your downloaded archive:

   ```sh
   mkdir -p "$HOME/Applications"
   tar -xzf /path/to/tenet.tar.gz -C "$HOME/Applications"
   TENET_DIR="$HOME/Applications/tenet"
   cd "$TENET_DIR"
   ```

2. Install production dependencies with the included npm lock, then register the stable path with Pi:

   ```sh
   npm ci --omit=dev --ignore-scripts
   pi install "$TENET_DIR"
   pi list
   ```

   Dependency installation needs npm registry access or its cache. Use `package-lock.json`, not a checkout's Bun development lock.
3. Check that `pi list` shows the stable path. Pi loads it in place; it does not copy the directory or install dependencies. Keep both available.
4. Close all running Pi processes. Do not also load this extension with `-e`. `/reload` and `/new` can retain old module imports and do not replace a full restart.

No compiler, frontend build or Pi dependency copy is needed. The only archive package script is `inspector:serve`. No global `tenet` binary is installed. Run doctor through the compiled CLI below.

## Per-project setup before any assessed action

Complete these steps in each project. Use the later enforcement, SDK, update and rollback sections only when you need those tasks.

Before launching Pi, review these limits:

- The selected judge receives full policy text, identity/paths, field-redacted tool arguments and metadata, and bounded observations. TypeSafe uses quota; APUS through private forwarding sends these to Pika and uses CPU. Source, commands, URLs and rule text can retain secrets despite redaction. Backend log access and retention are the owner's responsibility.
- Local capture is on by default. It saves submitted strings in `~/.tenet/recordings`. This is best-effort, unencrypted same-user storage, not protection against an agent running as you.
- Observe never vetoes or opens approval. Tenet is not an OS sandbox, and actions outside Pi's hooks are not covered. Pi installation does not verify the Claude Code prototype.

1. Before provider or owner settings changes, obtain separate authorization for full policy/selected-evidence disclosure to that service, with the quota/CPU, capture and backend-log risks above. TypeSafe is the absent-settings default and requires `TYPESAFE_API_KEY` through your secret manager in the launch shell. Never put it in policy, source, chat or command arguments.

   APUS needs no TypeSafe key; follow the shipped [private Pika setup and settings guide](judge.md#plan-private-pika-setup) only with separate service, tunnel and owner-file authorization. Doctor reads process environment, not dotenv files or a secret manager.
2. If you do not want new local capture, set this before launching:

   ```sh
   export TENET_RECORDING=off
   ```

   This does not prevent provider disclosure, disable observation or native findings, or delete old records. Omit it to retain evidence for the inspector.

   Before writing owner policy, obtain separate authorization. Future assessment discloses full policy and selected evidence to TypeSafe or Pika, with possible secrets despite redaction, quota/CPU cost, default capture and owner-controlled backend logs. Capture-off stops neither disclosure nor all logs.

3. In your project, author `TENET.md` yourself in an editor or owner shell, outside the guarded agent's intercepted path. For example:

   ```tenet-policy
   Rule; Ask before overwriting owner-demo.txt.
   ```

   This illustrative local rule is not a complete security policy. Review your own rules. Do not ask the guarded agent to migrate or weaken its active policy.

`Rule; text` is the supported short form, with default severity `BLOCK`. It can require approval or prohibit an action. Each declaration is one physical line beginning with case-sensitive `Rule;`.

Explicit `BLOCK`, advisory `WARN` and per-rule metadata are optional choices in [the rule reference](ARCHIVE-OPERATION.md#write-one-line-rules). Plain prose is not enforced. A declaration inside a Markdown fence is still active.

No policy ships in the archive. Only `TENET.md` in the session working directory selects a policy. There is no parent search or bundled fallback. Without a local policy, both modes are dormant, including enforce. For complete grammar, limits, thresholds and owner controls, see [policy selection and limits](ARCHIVE-OPERATION.md#eligibility-and-owner-control).

For an older override-based setup, follow [local policy migration](ARCHIVE-OPERATION.md#migrate-from-tenet_policy) before restarting. The removed environment setting cannot activate the project.

### Check setup offline

Run from your project, in the same shell environment the next Pi process will inherit. Replace the project placeholder. `TENET_DIR` must still name the stable installation:

```sh
cd /absolute/path/to/your/project
node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD"
node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD" --json
```

Bun can run the same compiled CLI. Doctor checks the installation containing that CLI and the selected project. It sends no evidence and changes no files.

`ready` means local prerequisites are valid. Hooks, credential validity and provider connectivity remain unverified. Fix invalid or unavailable setup before launch. `off` and `dormant` are bypass states, not passing assessments. See [doctor states, exits and limits](doctor.md).

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

Pending, cancelled, dropped or unavailable assessment is not an all-clear. A released call does not prove execution, and stock Pi results do not establish exact invocation correlation. For missing commands or findings, see [troubleshooting](ARCHIVE-OPERATION.md#troubleshooting).

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
   npm run inspector:serve
   ```

   For another archive directory, use an actual absolute path:

   ```sh
   TENET_RECORDING_DIR=/absolute/private/records npm run inspector:serve
   ```

3. Open the printed URL, select a session and call, and inspect its recorded stages. Stop the standalone server with Ctrl-C.

No frontend rebuild, Pi or TypeSafe credential is needed. Recording opt-out leaves native findings but no new archive. Missing stages, unsupported schemas and partial indexing remain unknown, not passes. See [disclosure and storage limits](ARCHIVE-OPERATION.md#disclosure-and-limits).

Embedding applications can install the stable local directory with `npm install /absolute/path/to/tenet`, then import the compiled ESM SDK and declarations. See [the alpha SDK contract](sdk.md). Repository example and build commands are checkout-only developer commands, not archive prerequisites.

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

1. Close all Pi processes and the inspector. Review the target version's grammar, controls and mode defaults before relaunching.
2. Replace the whole installation at the same stable path with the desired verified archive. Do not overlay archives.
3. Reinstall that archive's dependencies with `npm ci --omit=dev --ignore-scripts` from the stable directory, then restart.

Policies remain owner-managed. Older versions may ignore observe mode or `WARN`/threshold metadata and block by default. Remove per-rule threshold metadata externally before reverting to a version that treats it as prose. See [policy migration](ARCHIVE-OPERATION.md#owner-only-policy-management).

A pre-SDK archive removes the alpha SDK entry, so embedding consumers must not expect the import to survive. Historical evidence keeps its recorded contract versions. Rollback neither migrates nor erases it; older inspectors may support only a subset.

## What the delivery checks prove

The archive contains the compiled Pi extension, alpha SDK and declarations, offline doctor CLI, local inspector runtime and built assets, production dependency metadata and lock, operation/judge references, APUS runtime/settings modules and required renderer license/NOTICE. It excludes tests, model weights, Python dependencies/oracle, owner settings/policies, credentials, recordings, trial/machine-specific scripts and development dependencies.

Developers and CI run `bun run package:archive` from a repository checkout, not the archive. It builds `delivery/tenet.tar.gz`, checks a closed file list and production manifest/lock, and extracts outside the checkout. A verification failure prevents delivery.

Verification installs production dependencies, checks isolated Node/Bun imports and declarations, serves built inspector assets and historical scripted findings, and tests pinned Pi discovery and dispatch. The isolated owner recipe registers a stable path, creates policy externally, runs the delivered doctor in text and JSON, and launches fresh observe and enforce processes.

A scripted judge and assistant exercise only a disposable local `owner-demo.txt`. Observe releases the pending write and later shows a counterfactual `BLOCK` finding.

Enforce tests `PASS`, denied and approved native confirmation, and `FAIL` through actual local executor counts. The registered production extension uses scripted responses, not an alternate guard.

The recipe then removes loading while retaining policy and evidence. It uses only temporary HOME settings and synthetic credentials and makes no live evaluator requests. Owners need no test-tool registration or SDK implementation to use Tenet.

Relocated checks also parse the shipped judge settings examples, test APUS identity/readiness and offline doctor under Node/Bun, trap import/doctor side effects, and exercise native requests with scripted transport. Provider failure and invalid settings never fall back to TypeSafe. The archive is checked as built, not inferred from source tests. The separate raw metadata gate reads tar/PAX entries without extraction or execution.

`bun run package:verify delivery/tenet.tar.gz` repeats relocated checks from a checkout. Dependency installation uses registry access or its cache; assessment and host checks are offline. They prove installation and dispatch mechanics, not semantic accuracy, public publication, a sandbox or verified Claude coverage.
