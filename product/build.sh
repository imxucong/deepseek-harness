#!/usr/bin/env bash
# Build the harness artifacts and the TopAsk brand package.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export DSH_CLIENT_TITLE="${DSH_CLIENT_TITLE:-TopAsk}"

pnpm run build
pnpm --filter @topask/dsh-topask run build

echo "TopAsk artifacts are ready. Initialize the profile with product/init-profile.sh."
