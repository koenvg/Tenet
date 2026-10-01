# Contributing to TENET

TENET is a Pi extension with an optional local decision inspector. Before changing a policy decision, read the [behavior and limits](README.md) and add an offline test. An offline test should use an injected judge or scripted response, not a live TypeSafe account.

## Set up

Use Bun 1.3.14+ and Node 22.12+:

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

Build before the Bun suite: the Pi inspector-command tests serve files from `inspector/dist`. On Linux, install Chromium's system libraries with `bunx playwright install --with-deps chromium`. CI runs these checks on pushes to `main` and on pull requests. The Bun suite includes the Pi smoke tests.

Do not put `TYPESAFE_API_KEY`, policy text with credentials, or local TENET recordings in a commit, screenshot, or test artifact. The inspector's archives can contain exact submitted source text and secrets even with redaction. The live evaluation commands under `eval/` contact TypeSafe, use quota, and are **not** part of CI; run them only with separate authorization. Only invited collaborators can open Issues or Pull Requests for now; everyone else can read and fork once the repository is public. Report vulnerabilities through the private route in [SECURITY.md](SECURITY.md).
