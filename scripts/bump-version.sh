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

npm version "$bump" --no-git-tag-version
echo ""
