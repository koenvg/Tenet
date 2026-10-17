#!/bin/bash
set -euo pipefail

pi_package=
if (( $# )); then
  if [[ $# != 2 || $1 != --pi-package || $2 != /* || ! -f $2/package.json ]]; then
    echo 'Usage: check-mcp-hooks.sh [--pi-package /absolute/path/to/installed/pi-coding-agent]' >&2
    exit 2
  fi
  pi_package=$(cd "$2" && pwd -P)
fi
# Canonical entry: env -u BASH_ENV -u ENV /bin/bash --noprofile --norc scripts/check-mcp-hooks.sh
checkout=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
bun_executable=$(command -v bun)
[[ $bun_executable = /* && -x $bun_executable ]] || { echo 'Bun must resolve to an absolute executable.' >&2; exit 1; }
command -v node >/dev/null
umask 077
root=$(mktemp -d /tmp/tenet-mcp-check.XXXXXX)
root=$(cd "$root" && pwd -P)
trap 'rm -rf -- "$root"' EXIT
mkdir "$root/bin" "$root/home"
printf '#!/bin/sh\nexec "%s" --no-env-file "$@"\n' "$bun_executable" > "$root/bin/bun"
chmod 700 "$root/bin/bun"
cd "$checkout"
env -i PATH="$root/bin:$PATH" HOME="$root/home" TMPDIR="$root" CI=1 BUN_OPTIONS=--no-env-file \
  XDG_CONFIG_HOME="$root/home/.config" XDG_CACHE_HOME="$root/home/.cache" XDG_DATA_HOME="$root/home/.local/share" \
  PI_CODING_AGENT_DIR="$root/home/pi" npm_config_cache="$root/home/.npm" \
  npm_config_userconfig="$root/home/.npmrc" npm_config_globalconfig="$root/home/.npm-globalrc" TENET_TEST_PI_PACKAGE="$pi_package" \
  /bin/bash --noprofile --norc -c '
    set -euo pipefail
    bun run sdk:build
    if [[ -n $TENET_TEST_PI_PACKAGE ]]; then
      node examples/mcp-hooks/pi-native-check.mjs --pi-package "$TENET_TEST_PI_PACKAGE"
    else
      node examples/dist/mcp-hooks/demo.js
      bun test test/mcp-hooks.test.ts --isolate --max-concurrency=1 --timeout=30000
    fi
  '
