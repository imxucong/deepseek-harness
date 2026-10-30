#!/usr/bin/env bash
# Copy the TopAsk favicons and update the Web app manifest.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cp "$ROOT/product/assets/favicon.svg" "$ROOT/apps/web/public/favicon.svg"
cp "$ROOT/product/assets/favicon-dark.svg" "$ROOT/apps/web/public/favicon-dark.svg"

node - "$ROOT/apps/web/public/manifest.webmanifest" <<'NODE'
const fs = require('node:fs')
const file = process.argv[2]
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
manifest.name = 'TopAsk'
manifest.short_name = 'TopAsk'
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
NODE

echo "Synced TopAsk favicons and manifest."
