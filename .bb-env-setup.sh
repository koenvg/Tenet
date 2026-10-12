#!/usr/bin/env bash
set -euo pipefail

# BB runs this hook from the new worktree root.
if [[ ! -f package.json || ! -f bun.lock ]]; then
  echo "Tenet setup requires package.json and bun.lock in the current directory." >&2
  exit 1
fi

require_version() {
  local tool=$1 minimum=$2 major=$3 minor=$4 patch=$5 version
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Tenet setup requires $tool $minimum+ on PATH." >&2
    exit 1
  fi
  version=$("$tool" --version)
  if [[ ! "$version" =~ ^v?([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] ||
    (( BASH_REMATCH[1] < major ||
       (BASH_REMATCH[1] == major && BASH_REMATCH[2] < minor) ||
       (BASH_REMATCH[1] == major && BASH_REMATCH[2] == minor && BASH_REMATCH[3] < patch) )); then
    echo "Tenet setup requires $tool $minimum+; found $version." >&2
    exit 1
  fi
}

# Contributor minimums from CONTRIBUTING.md, including the pinned Pi tooling.
require_version bun 1.3.14 1 3 14
require_version node 22.19.0 22 19 0

# Include root development tools. Only Bun's download cache may be shared.
unset NODE_ENV
exec bun --no-env-file install --frozen-lockfile
