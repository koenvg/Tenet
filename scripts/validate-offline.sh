#!/bin/bash
set -euo pipefail

browser_cache=${PLAYWRIGHT_BROWSERS_PATH-}
if (( $# )); then
  if [[ $# != 2 || $1 != --browser-cache ]]; then
    echo 'Usage: validate-offline.sh [--browser-cache /absolute/executable-cache]' >&2
    exit 2
  fi
  browser_cache=$2
fi
if [[ $browser_cache != /* || ! -d $browser_cache ]]; then
  echo 'Provide an existing absolute browser executable cache via PLAYWRIGHT_BROWSERS_PATH or --browser-cache.' >&2
  exit 2
fi
browser_cache=$(cd "$browser_cache" && pwd -P)
checkout=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
bun_executable=$(command -v bun) || { echo 'Bun is required. Install dependencies before validation.' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node is required. Install dependencies before validation.' >&2; exit 1; }
[[ $bun_executable = /* && -x $bun_executable ]] || { echo 'Bun must resolve to an absolute executable on PATH.' >&2; exit 1; }

umask 077
root=$(mktemp -d /tmp/tenet-offline.XXXXXX)
root=$(cd "$root" && pwd -P)
worker=
shutdown_signal=TERM

cleanup() {
  local status=$? attempt
  trap - EXIT
  trap '' INT TERM
  if [[ -n $worker ]]; then
    kill -"$shutdown_signal" -- "-$worker" 2>/dev/null || true
    for ((attempt=0; attempt<40; attempt++)); do
      kill -0 -- "-$worker" 2>/dev/null || break
      sleep 0.05
    done
    kill -KILL -- "-$worker" 2>/dev/null || true
    wait "$worker" 2>/dev/null || true
    for ((attempt=0; attempt<40; attempt++)); do
      kill -0 -- "-$worker" 2>/dev/null || break
      sleep 0.05
    done
    if kill -0 -- "-$worker" 2>/dev/null; then
      echo "Worker group did not stop; retained temporary state at $root." >&2
      (( status != 0 )) || status=1
      exit "$status"
    fi
  fi
  local consumer_state
  if ! consumer_state=$(find -P "$root" -name .tenet-consumer-state -print -quit) || [[ -n $consumer_state ]]; then
    echo "Consumer shutdown unconfirmed; retained temporary state at $root." >&2
    (( status != 0 )) || status=1
    exit "$status"
  fi
  rm -rf -- "$root" || { (( status != 0 )) || status=1; }
  exit "$status"
}
interrupt() {
  trap '' INT TERM
  shutdown_signal=$1
  exit "$2"
}
trap cleanup EXIT
trap 'interrupt INT 130' INT
trap 'interrupt TERM 143' TERM

home=$root/home
mkdir -p "$root/bin" "$home/.config" "$home/.cache" "$home/.local/share" "$home/pi" "$home/.npm"
: > "$home/.npmrc"
: > "$home/.npm-globalrc"
printf '#!/bin/bash\nexec %q --no-env-file "$@"\n' "$bun_executable" > "$root/bin/bun"
chmod 700 "$root/bin/bun"

checks() {
  set -euo pipefail
  umask 022
  cd "$1"
  bun run sdk:build
  bun run inspector:build
  bun run summary:build
  bun run site:build
  (
    cd bb-plugin-tenet-status
    bun ../scripts/check-summary-build.ts
    bun run build:server
  )
  local status=0
  # Bun's isolated node:assert imports can collide on captured stderr pipes.
  bun run test > "$TMPDIR/bun-suite.log" 2>&1 || status=$?
  cat "$TMPDIR/bun-suite.log" || { local replay_status=$?; (( status != 0 )) || status=$replay_status; }
  (( status == 0 )) || return "$status"
  bun run typecheck
  bun run delivery:check
  bun run inspector:check
  bun run inspector:test
  (
    cd bb-plugin-tenet-status
    ./node_modules/.bin/tsc --noEmit
    ./node_modules/.bin/vitest run --config vitest.config.ts
  )
}

# Job control gives the complete worker tree a separate process group on macOS and Linux.
set -m
env -i PATH="$root/bin:$PATH" HOME="$home" TMPDIR="$root" CI=1 \
  XDG_CONFIG_HOME="$home/.config" XDG_CACHE_HOME="$home/.cache" XDG_DATA_HOME="$home/.local/share" \
  PI_CODING_AGENT_DIR="$home/pi" npm_config_cache="$home/.npm" \
  npm_config_userconfig="$home/.npmrc" npm_config_globalconfig="$home/.npm-globalrc" \
  COPYFILE_DISABLE=1 BUN_OPTIONS=--no-env-file PLAYWRIGHT_BROWSERS_PATH="$browser_cache" \
  /bin/bash --noprofile --norc -c "$(declare -f checks); checks \"\$1\"" validate-offline "$checkout" &
worker=$!
status=0
wait "$worker" || status=$?
exit "$status"
