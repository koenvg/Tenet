# Tenet production archive

This private archive contains the compiled Pi extension, alpha SDK and declarations, offline doctor CLI, local inspector runtime and built assets, production dependency metadata and lock, operation references, and licenses. Tests, owner policies, credentials, recordings and development dependencies are excluded. Obtain it through the private GitHub Actions artifact channel. No npm publication or public release is delivered.

## Install once in a stable directory

Use Node 22.19+ with npm and Bun 1.3.14+ for Pi use. Pi is a separate host installation, tested at `@earendil-works/pi-coding-agent` 0.85.1. SDK-only use supports Node 22.12+ or Bun 1.3.14+ and does not need Pi.

Choose a persistent directory you own, not a worktree or temporary download folder. For a first install:

```sh
mkdir -p "$HOME/Applications"
tar -xzf /path/to/tenet.tar.gz -C "$HOME/Applications"
TENET_DIR="$HOME/Applications/tenet"
cd "$TENET_DIR"
npm ci --omit=dev --ignore-scripts
pi install "$TENET_DIR"
pi list
```

Use the included `package-lock.json` with npm, not a checkout's Bun development lock. No compiler, frontend build or Pi dependency copy is needed. The only package script is `inspector:serve`; invoke doctor directly as shown below.

Pi registers this local path and loads it in place. It does not copy the directory or install its dependencies. Keep the stable directory and dependencies available. Close all running Pi processes after installation or replacement. Do not also use `-e` for this extension. `/reload` and `/new` can retain old module imports; neither replaces a full process restart.

## Per-project setup before any assessed action

Configure `TYPESAFE_API_KEY` through your secret manager in the shell that will launch Pi. Never put secrets in policy text, source, chat or command-line arguments. Doctor reads the process environment, not dotenv files or a secret manager.

Eligible sessions send policy text, identity and paths, field-redacted tool arguments and metadata, and bounded recent observations to TypeSafe. Secret-bearing source, commands, URLs and rule text can survive redaction. Local capture is on by default and saves submitted strings in `~/.tenet/recordings`. If you do not want new local evidence, set this before launching Pi:

```sh
export TENET_RECORDING=off
```

This does not prevent provider disclosure or disable observation and native findings. It does not delete old records. Omit it to retain evidence for the inspector. Capture is best-effort, unencrypted same-user storage, not a confidential boundary against an agent running as you.

Author your project's `TENET.md` yourself, outside the guarded agent's intercepted path. For example:

```text
Rule; BLOCK; Ask before overwriting owner-demo.txt.
```

Each declaration occupies one physical line beginning with case-sensitive `Rule;`. `BLOCK` can require approval or prohibit an action; `WARN` is advisory. Plain prose is not enforced, and a declaration inside a Markdown fence is still active. Review your own policy rather than treating this illustrative local rule as complete protection. No policy ships in the archive. See [policy selection and limits](ARCHIVE-OPERATION.md#eligibility-and-owner-control).

Diagnose the project without starting Pi:

```sh
cd /absolute/path/to/your/project
node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD"
node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD" --json
```

Bun can run the same compiled CLI. No global Tenet binary or SDK code is required. Doctor checks the installation containing that CLI and the selected project; it sends no evidence and changes no files. `ready` is local readiness, with hooks and provider still unverified. Correct invalid or unavailable prerequisites before launching. `off` and `dormant` are bypass states, not assessments. See [doctor states, exits and limits](doctor.md).

## Restart, observe and inspect findings

Start a new process from the project, selecting observation explicitly even if your shell has an old mode override:

```sh
TENET_MODE=observe pi
```

Check the footer for `TENET ON OBSERVE`, then run `/tenet status`. If a prior shared choice is off, `/tenet on` restores this process's observation mode. Bare `/tenet` opens owner findings, including rule locations and score gates. Observation permits calls without approval, evaluates snapshots in the background and can finish after a tool result or turn. Findings never become agent messages or later judge evidence.

Real assessed actions contact TypeSafe; there is no production mock fallback. Do not publish code or exercise a destructive effect to check setup. The offline archive acceptance flow instead scripts the judge and assistant and writes only a disposable local `owner-demo.txt`. It verifies pending observation followed by an owner-only counterfactual BLOCK finding. A fresh enforce process verifies PASS, denied and approved native confirmation, and FAIL through actual local executor counts. The owner need not register that test tool or implement the SDK. Offline checks prove dispatch mechanics, not evaluator accuracy.

Pending, cancelled, dropped or unavailable assessment is never an all-clear. A released call does not prove execution, and stock Pi results do not establish exact invocation correlation. Use the [troubleshooting reference](ARCHIVE-OPERATION.md#troubleshooting) for absent commands, broken policy, credentials, reporting loss and unverified coverage.

## Opt into enforcement later

Close Pi and start a new process with explicit mode selection:

```sh
TENET_MODE=enforce pi
```

Verify `TENET ON ENFORCE` with `/tenet status`. Enforce waits for assessment and, where required, native invocation-local owner confirmation. Denial, dismissal, missing UI or stale authorization withholds that invocation. A prohibition or unavailable assessment blocks without an approval override. `WARN` remains advisory.

`/tenet on` does not select enforcement. On/off is the cooperative machine-wide assessment and capture switch; mode is fixed for each process. `TENET_RECORDING=off` disables only local capture. Already released calls cannot be recalled, other processes notice off asynchronously, and same-user processes can change the control file. Neither control is an OS security boundary.

Pi's hook checks do not freeze arguments after release, correlate native results exactly, inspect subprocesses or supply stock authenticated action targets. Later hooks or executors may change an action. An untested host is not verified coverage. Claude Code remains an unverified prototype outside this setup path.

## Inspector and SDK

In an eligible Pi session, `/tenet-inspector` starts the built local inspector and attempts to open Arc on macOS. Otherwise open the printed loopback URL yourself. To inspect retained records after Pi exits:

```sh
cd "$TENET_DIR"
npm run inspector:serve
# Optional: TENET_RECORDING_DIR=/absolute/private/records npm run inspector:serve
```

No frontend rebuild, Pi or TypeSafe credential is needed. Stop it with Ctrl-C. The inspector is read-only and unauthenticated on loopback. Do not expose or proxy secret-bearing evidence to other machines. Recording opt-out means no new local archive; native findings still work. Missing stages, unsupported schemas and partial indexing remain unknown, not passes.

Embedding applications can add the stable local directory with `npm install /absolute/path/to/tenet`, then import the compiled ESM SDK and declarations. See [the alpha SDK contract](sdk.md). Checkout example/build commands are developer commands, not archive prerequisites.

## Removal and rollback

Remove the same path you registered, then restart Pi:

```sh
pi remove "$TENET_DIR"
pi list
```

Stop any standalone inspector before removing the stable installation directory. Off and uninstall do not erase historical evidence in `~/.tenet/recordings`, Pi's own session files or `~/.tenet/control.json`. Remove retained evidence separately only after stopping all writers and readers. Removing control resets the cooperative choice and lets fresh processes default to on.

For an upgrade or rollback, close Pi and the inspector, replace the whole installation at the same stable path with the desired verified archive, reinstall that archive's dependencies and restart. Do not overlay archives. Policy files remain owner-managed; review the target version's grammar, controls and mode defaults externally before relaunching. Older versions may ignore observe mode or WARN/threshold metadata and block by default. A pre-SDK archive removes the alpha SDK entry, so embedding consumers must not expect that import to survive. Historical evidence keeps its recorded contract versions; rollback does not migrate or erase it, and older inspectors may support only a subset.

## What the delivery checks prove

Developers and CI run `bun run package:archive` from a checkout. It builds `delivery/tenet.tar.gz`, validates a closed file list and production manifest/lock, and extracts outside the checkout. Verification installs production dependencies, checks isolated Node/Bun imports and declarations, serves built inspector assets and historical scripted findings, and tests pinned Pi discovery and dispatch.

The complete owner recipe runs with isolated home and Pi settings: register the stable path, create policy externally, invoke the delivered doctor in text and JSON, launch fresh observe and enforce processes, inspect native status and findings, exercise harmless local effects and native approval, then remove loading while retaining policy and evidence. The registered production extension uses scripted judge responses, not an alternate guard. No owner settings, credentials or live evaluator are touched. A verification failure prevents delivery of the archive.

`bun run package:verify delivery/tenet.tar.gz` repeats relocated checks. Dependency installation uses npm registry access or its cache; assessment and host tests are offline. These tests do not establish semantic accuracy, public publication, a sandbox or verified Claude coverage.
