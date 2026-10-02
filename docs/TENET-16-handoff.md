# TENET-16 handoff

Implemented the production archive delivery. The task is ready for PR review. No registry publication, public release or owner installation was performed.

## Use and delivery

From a development checkout with its dependencies installed:

```sh
bun run package:archive
# Optional output path:
bun run package:archive /absolute/path/to/tenet.tar.gz
# Recheck an existing archive:
bun run package:verify delivery/tenet.tar.gz
```

The default output is `delivery/tenet.tar.gz`. The archive has compiled SDK ESM/declarations, a thin compiled Pi entry, compiled inspector runtime, fresh built assets, curated documentation, MIT/Svelte/Kode Mono licenses, a production manifest and matching npm lock. It has no development scripts, source checkout, dependency tree, policies, credentials, recordings, tests or evaluation fixtures.

Install from a stable extracted directory with `npm ci --omit=dev --ignore-scripts`. Pi loads local packages in place and needs a process restart after registration or replacement. The SDK needs no Pi installation. See [the archive guide](INSTALL-ARCHIVE.md).

## Acceptance evidence

- One shared command builds, validates and verifies the tarball before replacing the output. CI runs it on PRs and main; only main uploads through the existing private artifact channel.
- Relocated production-only installs and isolated Node/Bun consumers resolve the SDK without the Pi host or development tools. A separate isolated TypeScript consumer resolves delivered declarations.
- The standalone inspector serves its existing assets and scripted findings over loopback without a frontend rebuild.
- The pinned Pi loader discovers exactly one extension. The production entry blocks missing credentials in enforce mode. Scripted native Pi dispatch runs exactly two harmless dummy executors across PASS, denied ASK, approved ASK and BLOCK. SDK observation records a counterfactual BLOCK while releasing the dummy; enforcement dispatches only PASS and approved ASK.
- Registration and removal use temporary home/settings directories. Fresh Node/Bun processes discover one registered extension after install and zero after removal.
- Nineteen content-contract tests cover curated completeness, contaminated policies/credentials/recordings/fixtures/dependencies/tools, unreferenced assets, symlinks, missing entries, absolute imports and manifest/lock mismatches. Archive checks reject traversal and links before extraction.
- The guide documents stable-path registration, production dependencies, restart, inspector, SDK use, removal, disclosure and coverage limits. Doctor integration and the complete owner quickstart remain TENET-17 work.

Packaging needs package-registry access to resolve/install dependencies. No acceptance exercise contacts a live evaluator or uses owner credentials/settings. Scripted results prove mechanics, not semantic accuracy or OS isolation.

## Validation

Passed before completion review:

- `bun run sdk:build`
- `bun run inspector:build`
- `TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000`: 575 passed, 0 failed.
- `bun run typecheck`
- `bun run inspector:check`: 0 errors, 0 warnings.
- `CI=1 bun run inspector:test`: 16 component and 24 browser tests passed.
- `bun run package:archive`: full relocated verification passed with Node 24.14.0 and Bun 1.3.14.

The initial full-suite run lacked the repository's existing BB plugin dependencies and used a long sandbox temporary path unsuitable for Unix sockets. Installing those dependencies and setting a short `TMPDIR` resolved the setup failures without changing product code.

## Completion review and resolution

The single fresh-context read-only review covered the full working-tree change, including untracked files, against `2c5d4b7c15ead7f0ef887dc36785160e175e9bc6`. It reported no structural regression and one P2 finding: the archive and contributor guides advertised Node 22.12 although pinned Pi 0.85.1 requires Node 22.19.

Resolved by distinguishing Node 22.19+ for Pi/development/archive verification from the unchanged Node 22.12+ SDK-only contract. The archive was then rebuilt and its full verification passed under Node 22.19.0 and Bun 1.3.14 using:

```sh
npm exec --yes --package=node@22.19.0 -- sh -c 'node --version && bun run package:archive'
```

`git diff --check 2c5d4b7c15ead7f0ef887dc36785160e175e9bc6` also passed. No second reviewer was launched. The original review report and final archive are attached to the task alongside this handoff.

## Files and remaining limits

- `scripts/package.ts`, `scripts/delivery-contract.ts`, `scripts/verify-delivery.ts`, `scripts/fixtures/` and `tsconfig.delivery.json` implement build/content/relocation checks.
- `test/delivery.test.ts` tests negative content contracts.
- `src/inspector/server.ts` hashes source TS or delivered ESM instead of requiring source-only files.
- `.github/workflows/ci.yml`, `package.json`, `tsconfig.json` and contributor/owner docs wire the same command into CI and document use.

CI execution was not part of the local validation recorded above. Live evaluator accuracy, actual owner setup, doctor integration and managed public installation remain outside this slice. Pi's result correlation, post-hook argument stability and authenticated action resolution remain unsupported.
