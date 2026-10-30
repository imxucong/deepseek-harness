#!/usr/bin/env bash
# Create or refresh the TopAsk profile under an isolated Harness home.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export DSH_HOME="${DSH_HOME:-$HOME/.topask}"
PROFILE="${1:-topask}"
PKG="$ROOT/product/dsh-topask"
PROFILE_MANIFEST="$DSH_HOME/profiles/$PROFILE/package.json"

if [[ ! -f "$PKG/lib/index.js" || ! -f "$PKG/lib/client.js" ]]; then
  echo "Building @topask/dsh-topask..."
  pnpm --filter @topask/dsh-topask run build
fi

echo "Initializing profile '$PROFILE' in $DSH_HOME from the web template..."
pnpm dsh --profile "$PROFILE" --from-default-profile web --dump-config >/dev/null

echo "Linking @topask/dsh-topask into the profile..."
pnpm dsh plugin --profile "$PROFILE" add "link:$PKG"

# The plugin manager enables a new bundle by default; this keeps the layer last
# even when the profile already existed and the bundle stayed declared but off.
node - "$PROFILE_MANIFEST" <<'NODE'
const fs = require('node:fs')
const file = process.argv[2]
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
manifest.dsh.profile.bundles ??= []
const name = '@topask/dsh-topask'
if (!manifest.dsh.profile.bundles.includes(name)) {
  manifest.dsh.profile.bundles.push(name)
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
}
NODE

echo "Verifying composition..."
pnpm dsh --profile "$PROFILE" --dump-config >/dev/null

echo "Profile ready. Start it with: product/run.sh $PROFILE"
