# Contributing to TENET

TENET is a Pi extension with an optional local decision inspector. Before changing a policy decision, read the [behavior and limits](README.md) and add an offline test. An offline test should use an injected judge or scripted response, not a live TypeSafe account.

## Set up

Use Bun 1.3.14+ and Node 22.19+ for development and archive verification with pinned Pi 0.85.1. SDK-only consumers support Node 22.12+. Install the development dependencies:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
```

## Check a change

```sh
bun run sdk:build
bun run inspector:build
bun test --isolate --max-concurrency=1 --timeout=30000
bun run typecheck
bun run inspector:check
CI=1 bun run inspector:test
```

The standalone SDK imports compiled output. `sdk:build` must run before tests, and `typecheck` also checks the executable guide example. `bun run sdk:example` runs that example offline under Node. See [the alpha SDK guide](docs/sdk.md).
`bun run package:archive` builds and verifies `delivery/tenet.tar.gz` using the same command as CI. It requires npm for the production lock and isolated installs. Verification includes Node/Bun consumers, TypeScript declarations, built inspector HTTP, pinned Pi discovery/dispatch and temporary registration/removal. No provider or owner installation is involved. `bun run package:verify delivery/tenet.tar.gz` reruns relocated checks. See [the archive guide](docs/INSTALL-ARCHIVE.md).
The separate archive metadata check requires Python 3 for development validation, tested with Python 3.11. It uses only the standard library to inspect raw entries and PAX headers without extraction or execution. After building the archive, run `python3 -B scripts/check-archive-metadata.py delivery/tenet.tar.gz`, as the delivery CI lane does. It rejects AppleDouble files, host filesystem/xattr metadata, unsafe paths and links while allowing standard tar format fields. Python is not shipped and is not required by `package:archive`, `package:verify` or installed Tenet. Archive creation suppresses host xattrs and macOS AppleDouble metadata. The archive build remains in the delivery lane, not the ordinary offline suite.

Build before the Bun suite: the Pi inspector-command tests serve files from `inspector/dist`. On Linux, install Chromium's system libraries with `bunx playwright install --with-deps chromium`. CI runs these checks on pushes to `main` and on pull requests. The Bun suite includes the Pi smoke tests.

For integrated evidence, question and report changes, build the SDK and inspector first. Use a short macOS temp path and no provider credentials:

```sh
env -u TYPESAFE_API_KEY TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000 test/applicability-comparison.test.ts test/evidence-preparation.test.ts test/evidence-budget-capture.test.ts test/applicability-contract.test.ts test/applicability.test.ts test/assessment-metadata.test.ts test/resolved-action.test.ts test/decision.test.ts test/runtime-contract.test.ts test/approval-lifecycle.test.ts test/evidence-selection-live.test.ts test/evidence-selection-report.test.ts
```

Then run the complete offline sequence above and `bun run sdk:example`. The restored historical campaign tests must execute, not be skipped for question drift. The report-only replay and its readable output are documented in [the offline comparison guide](eval/applicability-README.md). Live provider commands, packaging and active-service restarts are not part of this verification.

For current-action evidence selection, use the focused offline suite after the builds:

```sh
bun test test/evidence-preparation.test.ts test/resolved-action.test.ts test/trajectory.test.ts test/evidence-budget-capture.test.ts --isolate --max-concurrency=1 --timeout=30000
```

These authored regressions cover metadata tiers, exact UTF-8 boundaries including omission markers, final-only loss accounting, required-evidence overflow and unchanged host-fact safety. Capture tests use synthetic Pi hooks and the compiled SDK with an injected scripted transport. They compare submitted state with the recorded request and verify that later history cannot alter either snapshot. They make no claim about live evaluator accuracy or deployed executor coverage.

Do not put `TYPESAFE_API_KEY`, policy text with credentials, or local TENET recordings in a commit, screenshot, or test artifact. The inspector's archives can contain exact submitted source text and secrets even with redaction. The live evaluation commands under `eval/` contact TypeSafe, use quota, and are **not** part of CI; run them only with separate authorization. Only invited collaborators can open Issues or Pull Requests for now; everyone else can read and fork once the repository is public. Report vulnerabilities through the private route in [SECURITY.md](SECURITY.md).
