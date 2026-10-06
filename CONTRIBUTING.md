# Contributing to TENET

TENET is a Pi extension with an optional local decision inspector. Before changing a policy decision, read the [behavior and limits](README.md) and add an offline test. An offline test should use an injected judge or scripted response, not a live TypeSafe account.

## Write and review documentation

Before creating or editing documentation, read and follow [the writing guide](docs/writing-guide.md). Before submitting the change, manually review every changed page against the guide's checklist and resolve failed items.

## Set up

Use this developer checkout to change Tenet and run offline checks. Use Bun 1.3.14+ and Node 22.19+ with pinned Pi 0.85.1. SDK-only consumers support Node 22.12+.

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

Run these steps in order from the repository root. They cover the application, inspector, and BB plugin checks in [application CI](.github/workflows/ci.yml). CI runs on pushes to `main` and on pull requests.


First start a disposable shell with a real temporary owner home. Unset provider credentials and overrides so checks cannot read personal policies or use live credentials:

```sh
TEST_HOME=$(mktemp -d)
TEST_HOME=$(cd "$TEST_HOME" && pwd -P)
mkdir "$TEST_HOME/bin"
printf '#!/bin/sh\nexec "%s" --no-env-file "$@"\n' "$(command -v bun)" > "$TEST_HOME/bin/bun"
chmod 700 "$TEST_HOME/bin/bun"
env -i PATH="$TEST_HOME/bin:$PATH" HOME="$TEST_HOME" TMPDIR=/tmp bash --noprofile --norc
```

The temporary Bun wrapper prevents `.env` auto-loading in checks and child processes. The clean environment removes credentials and `TENET_POLICY`. Run the ordered checks inside that shell, then use `exit`. Remove only the disposable `$TEST_HOME` after all fixture processes close.

If Chromium was installed in the original home's cache, set `PLAYWRIGHT_BROWSERS_PATH` inside the shell to that cache's absolute path before browser checks. Do not use a signed-in browser.

1. Build the SDK and inspector before the Bun suite:

   ```sh
   bun run sdk:build
   bun run inspector:build
   ```

   SDK tests import compiled output. Pi inspector-command tests serve files from `inspector/dist`.

   Global discovery makes isolation required for validation. Start checks with a realpath disposable process `HOME`, unset provider credentials and `TENET_POLICY`, and keep all selected owner-home data in fixtures. Passing `env.HOME` to a guard alone does not change `node:os.homedir()`.

   Use a separate child process for each global-policy fixture. Do not read or copy the owner's personal policy.

2. Run the isolated, serial Bun suite, including Pi smoke tests, then the application type check:

   ```sh
   bun test --isolate --max-concurrency=1 --timeout=30000
   bun run typecheck
   ```

   `typecheck` also builds the SDK and checks the executable guide example. To run that example offline under Node, use `bun run sdk:example`. See [the alpha SDK guide](docs/sdk.md).

3. Check the inspector and run both browser suites:

   ```sh
   bun run inspector:check
   CI=1 bun run inspector:test
   ```

   The test command runs components, builds the client, then tests the built app. It uses disposable headless Chromium, not a signed-in browser. See [inspector test coverage and failures](inspector/tests/README.md).

4. Check the BB plugin from its own directory:

   ```sh
   cd bb-plugin-tenet-status
   ./node_modules/.bin/tsc --noEmit
   ./node_modules/.bin/vitest run --config vitest.config.ts
   cd ..
   ```

Success means each command exits zero. Offline success does not prove live evaluator accuracy, provider connectivity, or active host hooks. For website changes, also follow [the separate local website check](docs/DEPLOYMENT.md#build-and-verify-locally).

### Check evidence, questions and reports

Use these focused offline checks for changes to current-action evidence, question wording or report identities. Build the SDK and inspector first. On macOS, use a short temporary path and unset provider credentials:

```sh
env -u TYPESAFE_API_KEY TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000 test/applicability-comparison.test.ts test/evidence-preparation.test.ts test/evidence-budget-capture.test.ts test/applicability-contract.test.ts test/applicability.test.ts test/assessment-metadata.test.ts test/resolved-action.test.ts test/decision.test.ts test/runtime-contract.test.ts test/approval-lifecycle.test.ts test/evidence-selection-live.test.ts test/evidence-selection-report.test.ts
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

Code and environment changes need a full Pi process restart. Under Pi 0.85.1 and Bun 1.3.14, `/reload` and `/new` can retain old imports. Policy-only changes can use session-start reload; check the new digest and count.

Unloading removes observation and enforcement. There is no live-mode mock fallback. See [owner controls, removal and rollback](docs/INSTALL-ARCHIVE.md#removal-and-rollback).

## A check fails

- Missing SDK output or inspector assets: run both build commands before the Bun suite.
- Chromium cannot start: install Chromium and, on Linux, its system libraries.
- Startup tests time out with plain `bun test`: use the isolated serial command above. On Bun 1.3.14, the all-file default can register `node:test` files inside another running test.
- Archive metadata fails: inspect the named entry and rebuild without host metadata. Do not skip the separate metadata gate.

## Keep secrets and live work separate

Do not put `TYPESAFE_API_KEY`, policy text with credentials, or local TENET recordings in a commit, screenshot, or test artifact. Inspector archives can contain exact submitted source text and secrets even with redaction.

Live commands under `eval/` send rule text and evidence to TypeSafe and use API quota. They are not part of CI. Obtain separate operator authorization before any live evaluation. Remote publication needs its own bounded authorization and native approval for each invocation. Use the [evaluation guides](eval/README.md), not the offline check list, for those procedures. A documented deployment command also does not authorize deployment or a running service restart.

Only invited collaborators can open Issues or Pull Requests for now. Everyone else can read and fork once the repository is public. Report vulnerabilities through the private route in [SECURITY.md](SECURITY.md).
