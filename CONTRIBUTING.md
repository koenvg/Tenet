# Contributing to TENET

TENET is a Pi extension with an optional local decision inspector. Before changing a policy decision, read the [behavior and limits](README.md) and add an offline test. An offline test should use an injected judge or scripted response, not a live TypeSafe account.

## Write and review documentation

Before creating or editing documentation, read and follow [the writing guide](docs/writing-guide.md). Before submitting the change, manually review every changed page against the guide's checklist and resolve failed items.

## Set up

Use this developer checkout to change Tenet and run offline checks. Use Bun 1.3.14+ and Node 22.19+ with pinned Pi 1.1.0. SDK-only consumers support Node 22.12+.

1. From the repository root, install the locked application and BB plugin dependencies:

   ```sh
   bun install --frozen-lockfile
   npm ci --prefix bb-plugin-tenet-status
   ```

2. Install disposable Chromium for the inspector tests:

   ```sh
   bunx playwright install chromium
   ```

   On Linux, use `bunx playwright install --with-deps chromium` to install its system libraries too.

Dependency and browser installation can download packages. The checks below do not call TypeSafe or publish fixture actions. Keep `TYPESAFE_API_KEY` out of the validation environment.

## Check a change

Run the supported offline lane from the repository root. It covers the application, inspector and BB plugin checks in [application CI](.github/workflows/ci.yml). CI runs on pushes to `main` and on pull requests.

Complete [Set up](#set-up) first. Supply an existing absolute Playwright executable-cache path. The runner does not install dependencies or browsers.

Replace `/absolute/path/to/ms-playwright` below with that directory. Typical paths are `/Users/your-name/Library/Caches/ms-playwright` on macOS and `/home/your-name/.cache/ms-playwright` on Linux.

```sh
env -u BASH_ENV -u ENV /bin/bash --noprofile --norc scripts/validate-offline.sh --browser-cache /absolute/path/to/ms-playwright
```

This is the canonical entry. Removing `BASH_ENV` and `ENV` before Bash starts prevents shell startup hooks.

The runner creates a private realpath home under `/tmp` and starts checks with an allowlisted environment. It excludes inherited credentials, `TENET_POLICY`, runtime hooks, proxies and owner configuration.

It sets disposable XDG, Pi and npm locations. No personal policy or browser profile is read or copied.

The PATH Bun wrapper adds `--no-env-file`. Runner-owned `BUN_OPTIONS=--no-env-file` also protects inherited-environment children that launch Bun through `process.execPath`. Framework configurations disable their own dotenv discovery with `envDir: false`.

These controls are not a sandbox against code that deliberately replaces its environment or reads owner files.

The runner builds the SDK, inspector, summary and website first. It then validates the plugin summary and builds the plugin server before tests or types.

The complete Bun suite uses `--isolate --max-concurrency=1 --timeout=30000`. Its stdout and stderr go to a regular file that is replayed afterward.

Application types, delivery consumers, inspector types and all three Inspector lanes (Node infrastructure, mounted UI and browser journeys) follow. Plugin TypeScript and configured Vitest checks run last. Nested SDK and inspector rebuilds remain part of their existing commands.

The lane runs `bun run delivery:check` to compile fresh delivery APIs and inspector assets in a disposable installation. It runs the maintained SDK, doctor, configuration and report consumers under Node and Bun, then checks `scripts/fixtures/archive-types.ts` against fresh declarations.

This check uses locked checkout dependencies without registry installs or live judges. If a fixture fails, review the contract instead of generating expectations. It does not replace the separate required production-only archive lane below.

Success means exit zero. The runner stops at the first failure and preserves its exit code through log replay and cleanup.

INT and TERM stop the worker process group, allow a bounded shutdown wait, then force remaining children to stop before removing only the invocation's temporary state. They return exit codes 130 and 143. SIGKILL cannot run cleanup.

If the worker group still exists after forced shutdown, the runner reports and retains its temporary directory instead of removing state that a child might still use.

Browser executable caches and checkout build output remain. Use separate worktrees for concurrent runs because builds share checkout output.

The inspector uses disposable headless Chromium, not a signed-in browser. See [inspector test coverage and failures](inspector/tests/README.md).

`bun run inspector:test` checks discovery and runs all three Inspector lanes. Inside the clean focused shell, select `inspector:test:components` for mounted UI behavior, `inspector:test:journeys` for Playwright Test journeys, or `inspector:test:node` for infrastructure and diagnostic subprocesses. The last two commands build inspector assets first. Keep all three required for complete validation.

Offline success does not prove live evaluator accuracy, provider connectivity or active host hooks. For website changes, also follow [the separate local website check](docs/DEPLOYMENT.md#build-and-verify-locally).

### Use the package alias

In a shell with no runtime startup hooks, you can use the package alias. Set `PLAYWRIGHT_BROWSERS_PATH` to the same existing absolute executable cache:

```sh
PLAYWRIGHT_BROWSERS_PATH=/absolute/path/to/ms-playwright bun --no-env-file run validate:offline
```

The initial Bun process starts before the alias can clean the environment. `--no-env-file` prevents its dotenv loading, but it does not neutralize inherited `BUN_OPTIONS` or other startup hooks. Use the canonical shell entry above when runtime hooks may be present.

### Run focused checks in a clean shell

Use the complete lane for ordinary validation. For a focused check, first start this disposable shell from the repository root. It uses a short realpath process home and excludes inherited credentials, policies and runtime hooks:

```sh
TEST_HOME=$(mktemp -d /tmp/tenet-focused.XXXXXX)
TEST_HOME=$(cd "$TEST_HOME" && pwd -P)
mkdir "$TEST_HOME/bin"
printf '#!/bin/sh\nexec "%s" --no-env-file "$@"\n' "$(command -v bun)" > "$TEST_HOME/bin/bun"
chmod 700 "$TEST_HOME/bin/bun"
env -i PATH="$TEST_HOME/bin:$PATH" HOME="$TEST_HOME" TMPDIR="$TEST_HOME" CI=1 BUN_OPTIONS=--no-env-file \
  XDG_CONFIG_HOME="$TEST_HOME/.config" XDG_CACHE_HOME="$TEST_HOME/.cache" XDG_DATA_HOME="$TEST_HOME/.local/share" \
  PI_CODING_AGENT_DIR="$TEST_HOME/pi" npm_config_cache="$TEST_HOME/.npm" \
  npm_config_userconfig="$TEST_HOME/.npmrc" npm_config_globalconfig="$TEST_HOME/.npm-globalrc" \
  /bin/bash --noprofile --norc
```

Run focused checks inside this shell, then use `exit`. After all fixture processes close, remove only the disposable `$TEST_HOME` from the original shell.

Before focused browser checks, set `PLAYWRIGHT_BROWSERS_PATH` inside the clean shell to the existing absolute executable cache. Never attach to a signed-in browser.

Build the prerequisites needed by your selected tests with `bun run sdk:build`, `bun run inspector:build`, `bun run summary:build` and `bun run site:build`. SDK tests import compiled output; Pi inspector-command tests serve `inspector/dist`; website content tests read prerendered `site/dist` pages.

Plugin mount tests import the generated summary library. See the [checkout-only summary build and input reference](inspector/summary-workspace.md).

Global discovery requires a disposable process `HOME`, not only a guard's `env.HOME`, because `node:os.homedir()` uses the process environment. Keep all selected owner-home data in fixtures and use a separate child process for each global-policy fixture. Do not read or copy the owner's personal policy.

The application `typecheck` also builds the SDK and checks the executable guide example. Run that example offline under Node with `bun run sdk:example`; see [the alpha SDK guide](docs/sdk.md).

### Package the BB plugin separately

The shared offline lane validates the summary build and runs `bun run build:server`. It does not run the external BB packaging command. With a supported BB CLI (`bb` version 0.43 or later) installed for your local BB setup, package from the repository root:

```sh
bun run plugin:build
```

This rebuilds the summary and runs `npm run build` in `bb-plugin-tenet-status`, including `bb plugin build .`. Packaging is separate from offline validation and does not authorize publication or an active-service restart.

### Check evidence, questions and reports

Use these focused offline checks for changes to current-action evidence, question wording or report identities. Run them inside the [clean focused-check shell](#run-focused-checks-in-a-clean-shell) above. Build the SDK and inspector first.

```sh
bun test --isolate --max-concurrency=1 --timeout=30000 test/applicability-comparison.test.ts test/evidence-preparation.test.ts test/evidence-budget-capture.test.ts test/applicability-contract.test.ts test/applicability.test.ts test/assessment-metadata.test.ts test/resolved-action.test.ts test/decision.test.ts test/runtime-contract.test.ts test/approval-lifecycle.test.ts test/evidence-selection-live.test.ts test/evidence-selection-report.test.ts
```

For current-action selection alone, run:

```sh
bun test test/evidence-preparation.test.ts test/resolved-action.test.ts test/trajectory.test.ts test/evidence-budget-capture.test.ts --isolate --max-concurrency=1 --timeout=30000
```

These regressions cover metadata tiers, exact UTF-8 boundaries including omission markers, final-only loss accounting, required-evidence overflow and unchanged host-fact safety. Synthetic Pi hooks and the compiled SDK use an injected scripted transport. Tests compare submitted state with its recording and check that later history cannot change either snapshot. They do not prove live evaluator accuracy or deployed executor coverage.

Then run the complete offline sequence above and `bun run sdk:example`. Restored historical campaign tests must execute, not be skipped for question drift. See [the offline comparison guide](eval/applicability-README.md) for report-only replay and readable output. Live provider calls, packaging and active-service restarts are separate from this verification.

## Verify the delivery archive

Run this separate delivery lane after the checks above. It is not part of the ordinary offline suite. You need npm for the production lock and isolated installs, which can access package registries. You also need Python 3 for the metadata check, tested with Python 3.11.

1. From the repository root, build and verify the archive with the same command as CI:

   ```sh
   bun run package:archive
   ```

   The result is `delivery/tenet.tar.gz`. Verification checks Node/Bun consumers, TypeScript declarations, built inspector HTTP, pinned Pi discovery/dispatch, and temporary registration/removal. Global-only, combined and project-override fixtures use validated temporary process homes and session directories, not the installation. It makes no provider calls and does not change the owner's installation.

2. Check raw archive metadata as the delivery CI lane does:

   ```sh
   python3 -B scripts/check-archive-metadata.py delivery/tenet.tar.gz
   ```

   This standard-library check inspects raw entries and PAX headers without extraction or execution. It rejects AppleDouble files, host filesystem/xattr metadata, unsafe paths, and unsafe links. It allows standard tar format fields. Archive creation suppresses host xattrs and macOS AppleDouble metadata.

3. To repeat only the relocated checks for an existing archive, run:

   ```sh
   bun run package:verify delivery/tenet.tar.gz
   ```

Each check must exit zero. Python is not shipped and is not required by `package:archive`, `package:verify`, or installed Tenet. See [archive installation and verification](docs/INSTALL-ARCHIVE.md).

## Run the source extension for development

This checkout-only path is for contributors, not archive owners. Complete [Set up](#set-up) and build the SDK before loading source. `bun run pi` and `bun run smoke` build it automatically.

Real assessed tool actions send policy, paths and evidence to TypeSafe and use quota. Strings can contain secrets despite field redaction. Capture is on by default and saves submitted strings locally. Any live check needs separate authorization; use `bun run smoke` for an offline dispatch check instead of a real upload.

1. Review the selected policy yourself outside the intercepted agent path. Use [the first-rule steps](docs/policy.md#write-a-first-rule) for a new policy, or [owner-only management](docs/policy.md#owner-only-policy-management-and-migration) to change one.
2. For a live-capable launch, configure `TYPESAFE_API_KEY` through your secret manager. Never put it in policy or the repository. Set `TENET_RECORDING=off` before launch if you do not want new local capture. This does not stop disclosure or erase old records.
3. From the repository root, start only the explicitly selected extension:

   ```sh
   bun run pi --no-extensions
   ```

   The script adds `-e ./src/pi/extension.ts`. Explicit extensions still load with `--no-extensions`. Do not use this path if Tenet is already registered as a Pi package.
4. Check native `/tenet status`. Startup identifies policy source, SHA-256, count and question version.

By default, optional `~/.tenet/TENET.md` from the process owner's home applies alongside session `TENET.md`. `TENET_POLICY` can select another absolute or session-relative project file; it never replaces global. Only confirmed absence of both implicit candidates without an override is dormant, with no Tenet UI.

Empty overrides, missing explicit files and unusable sources invalidate the whole set. Observe permits without a pass; enforce blocks. There is no global-path override, opt-out, parent search or fallback.

An extension load error means Tenet did not load.

For source loading across projects, use a stable checkout, not a disposable worktree. Replace the path, then run:

```sh
TENET_DIR=/absolute/path/to/stable/Tenet
cd "$TENET_DIR"
bun install --frozen-lockfile
bun run sdk:build
pi install "$TENET_DIR"
pi list
```

This is user-level registration; do not add `-l`. Pi loads `src/pi/extension.ts` through `package.json` in place. Keep the checkout and dependencies.

Launch plain `pi`, not a second `-e` copy or `bun run pi`. Each eligible session uses the reviewed optional global policy alongside any local or explicitly selected project policy. See [project policy selection](docs/policy.md#choose-the-policy-file) before restarting.

Code and environment changes need a full Pi process restart. Do not use `/reload` or `/new` to apply code or environment changes. Policy-only changes can use session-start reload; check the new digest and count.

Unloading removes observation and enforcement. There is no live-mode mock fallback. See [owner controls, removal and rollback](docs/INSTALL-ARCHIVE.md#removal-and-rollback).

## A check fails

- Missing SDK output, inspector assets or website pages: run the complete offline lane so prerequisite builds finish before tests.
- Chromium cannot start: install Chromium and, on Linux, its system libraries. Pass the existing absolute executable-cache directory to the runner.
- Startup tests time out with plain `bun test`: use `bun run test` inside the clean shell for the required isolation, serial execution and timeout flags. On Bun 1.3.14, the all-file default can register `node:test` files inside another running test.
- Archive metadata fails: inspect the named entry and rebuild without host metadata. Do not skip the separate metadata gate.

## Keep secrets and live work separate

Do not put `TYPESAFE_API_KEY`, policy text with credentials, or local TENET recordings in a commit, screenshot, or test artifact. Inspector archives can contain exact submitted source text and secrets even with redaction.

Live commands under `eval/` send rule text and evidence to TypeSafe and use API quota. They are not part of CI. Obtain separate operator authorization before any live evaluation. Remote publication needs its own bounded authorization and native approval for each invocation. Use the [evaluation guides](eval/README.md), not the offline check list, for those procedures. A documented deployment command also does not authorize deployment or a running service restart.

Only invited collaborators can open Issues or Pull Requests for now. Everyone else can read and fork once the repository is public. Report vulnerabilities through the private route in [SECURITY.md](SECURITY.md).
