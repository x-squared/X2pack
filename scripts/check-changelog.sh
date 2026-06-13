#!/bin/bash
set -e

VERSION=$(node -p "require('./package.json').version")
CHANGELOG="src/changelog.md"

if ! grep -q "^## Version $VERSION" "$CHANGELOG"; then
  echo ""
  echo "Error: no changelog entry for Version $VERSION in $CHANGELOG."
  echo "Add a '## Version $VERSION' section, then re-run."
  echo ""
  exit 1
fi

echo "Changelog OK — Version $VERSION found."
echo ""
