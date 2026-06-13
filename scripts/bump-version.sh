#!/bin/bash
set -e

echo ""
echo "Version bump type?"
echo "  1) increment (patch)"
echo "  2) minor"
echo "  3) major"
echo ""
read -r -p "Enter choice [1/2/3] or name [increment/minor/major]: " choice

case "$choice" in
  1|increment|patch)
    bump="patch"
    ;;
  2|minor)
    bump="minor"
    ;;
  3|major)
    bump="major"
    ;;
  *)
    echo "Invalid choice: '$choice'. Aborting."
    exit 1
    ;;
esac

# Calculate next version without touching package.json yet.
current=$(node -p "require('./package.json').version")
IFS='.' read -r major minor patch <<< "$current"
case "$bump" in
  patch) next="$major.$minor.$((patch + 1))" ;;
  minor) next="$major.$((minor + 1)).0" ;;
  major) next="$((major + 1)).0.0" ;;
esac

# Gate: changelog must have an entry for the next version before we commit to it.
if ! grep -q "^## Version $next" src/changelog.md; then
  echo ""
  echo "Error: no changelog entry for Version $next in src/changelog.md."
  echo "Add a '## Version $next' section, then re-run."
  echo ""
  exit 1
fi

npm version "$bump" --no-git-tag-version
echo ""
