# Tenet production archive

This private archive contains a thin Pi extension entry, compiled SDK and declarations, the local inspector runtime and built assets, production dependency metadata and lock, operation docs, and licenses. It is not a checkout or a managed public package. Tests, evaluator fixtures, owner policies, credentials, recordings and development dependencies are excluded. The offline doctor is not included yet; the final owner-experience delivery adds it.

## Install once in a stable directory

For Pi use Node 22.19+ with npm and Bun 1.3.14+. Pi is a separate host installation, tested at `@earendil-works/pi-coding-agent` 0.85.1, whose Node minimum is 22.19. SDK-only use supports Node 22.12+ or Bun 1.3.14+ and does not need Pi.

Choose a persistent directory you control, not a checkout worktree or temporary download folder. Extract the archive there and install only production dependencies:

```sh
mkdir -p "$HOME/Applications"
tar -xzf /path/to/tenet.tar.gz -C "$HOME/Applications"
TENET_DIR="$HOME/Applications/tenet"
cd "$TENET_DIR"
npm ci --omit=dev --ignore-scripts
pi install "$TENET_DIR"
pi list
```

Use the included `package-lock.json` with npm, not the repository's Bun development lock. No compiler, frontend build, Pi dependency copy or development scripts are needed. The only package script is `inspector:serve`.

Pi registers this local path and loads it in place. It does not copy the directory or install its dependencies. Keep the directory at that path. Close all running Pi processes and start a fresh `pi` after installation or replacement. Do not also use `-e` for the same extension. `/reload` can retain old imports and is not a substitute for a process restart.

To upgrade or roll back, close Pi and the inspector, replace the whole installation with the desired verified archive at the same stable path, run the dependency install again, then restart. Do not overlay new files onto an old installation.

## Before assessing real actions

Eligible sessions submit policy text and bounded tool evidence to TypeSafe. They also record submitted strings locally by default, and those strings can contain secrets despite redaction. Configure `TYPESAFE_API_KEY` through your secret manager, never in policy text. Set `TENET_RECORDING=off` before launching Pi to opt out of local capture. This does not prevent provider disclosure.

Author a project `TENET.md` yourself, outside the guarded agent's tool path. Each active rule must occupy a line beginning with `Rule;`, for example:

```text
Rule; BLOCK; Never publish code without explicit owner approval.
```

No policy ships in this archive. Without a local policy in the session's working directory or an explicit `TENET_POLICY`, Tenet is dormant and has no session commands or findings. See [operation and limits](docs/operation.md) for policy selection, controls and enforcement.

Start in observe mode with plain `pi`. In an eligible session, verify `TENET ON OBSERVE` and `/tenet status`. `/tenet` opens owner findings. Observation permits calls; pending or unavailable assessment is not an all-clear. To opt into enforcement, close Pi and launch a new process with `TENET_MODE=enforce pi`, then verify `TENET ON ENFORCE`. `/tenet on` restores that process's existing mode; it does not select enforcement.

## Inspector and SDK

In an eligible Pi session, `/tenet-inspector` starts the built local inspector and attempts to open Arc on macOS. Otherwise open its printed loopback URL yourself. To inspect historical records without Pi:

```sh
cd "$TENET_DIR"
npm run inspector:serve
# Optional: TENET_RECORDING_DIR=/absolute/path/to/records npm run inspector:serve
```

No frontend rebuild is required. Stop the standalone inspector with Ctrl-C. It serves potentially secret-bearing local evidence over loopback without authentication. Do not expose or proxy it to other machines. The default archive is `~/.tenet/recordings`; uninstalling does not delete it.

For an embedding application, after the production dependency install above, add the stable local directory as a dependency with `npm install /absolute/path/to/tenet`. Then import `createGuard` or `SDK_VERSION` from `tenet` under Node or Bun. The package exports compiled ESM and TypeScript declarations. See [the SDK contract](docs/sdk.md); its checkout-only example commands are for developers, not archive installation.

## Remove

```sh
pi remove "$TENET_DIR"
pi list
```

Close and restart Pi to stop loading Tenet. Stop any standalone inspector before removing the installation directory. `/tenet off` and uninstall do not erase historical evidence or `~/.tenet/control.json`. Remove those separately only if you intend to lose the records or reset the cooperative on/off choice. Neither off nor uninstall is a same-user security boundary.

## What the delivery checks prove

Developers and CI run the same `bun run package:archive` command from a checkout. It builds a fresh archive at `delivery/tenet.tar.gz`, validates a closed file list and production manifest/lock, then extracts outside the checkout. The verifier installs production dependencies, tests isolated Node/Bun consumers and TypeScript declarations, serves built inspector assets and scripted findings, loads exactly one extension with pinned Pi, and checks actual harmless dummy executor counts for release, denied approval, approved approval and block. Registration and removal use temporary Pi settings, not owner settings. A failure prevents writing the output archive.

These tests use scripted judges and make no live evaluator calls. They prove installation and dispatch mechanics, not semantic accuracy or a sandbox. Registry publication, public releases and managed public installation are not delivered. Obtain this archive through the existing private CI artifact channel.
