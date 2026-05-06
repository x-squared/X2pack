#!/usr/bin/env bash
# One-time local setup: install npm dependencies. Safe to re-run (npm install is idempotent).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f package.json ]]; then
  echo "setup-once.sh: package.json not found in ${ROOT}" >&2
  exit 1
fi

echo "==> X2pack one-time setup (${ROOT})"
echo "==> npm install"
npm install

echo ""
echo "Done. Start the app with: npm run dev"
