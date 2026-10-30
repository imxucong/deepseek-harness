#!/usr/bin/env bash
# Start the TopAsk profile with its own Harness home.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export DSH_HOME="${DSH_HOME:-$HOME/.topask}"

exec pnpm dsh --profile "${1:-topask}" "${@:2}"
