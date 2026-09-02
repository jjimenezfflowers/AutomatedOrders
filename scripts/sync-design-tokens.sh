#!/usr/bin/env bash
# Re-sync the vendored BloomBrain design tokens from a local bb-ui checkout.
#
#   ./scripts/sync-design-tokens.sh            # show what would change
#   ./scripts/sync-design-tokens.sh --apply    # write the update
#
# The tokens live in @fifty-git/ui, published to GitHub Packages. We vendor the
# stylesheet instead of installing the package so that local, Docker and CI
# builds need no registry auth. Upstream copies src/tokens/theme.css to
# dist/theme.css byte-for-byte, so reading it from a checkout is equivalent.

set -euo pipefail

BB_UI="${BB_UI_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/bb-ui}"
UPSTREAM="$BB_UI/src/tokens/theme.css"
VENDORED="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/angular-frontend/src/styles/theme.css"

if [[ ! -f "$UPSTREAM" ]]; then
  echo "bb-ui not found at $BB_UI" >&2
  echo "Clone it beside this repo, or set BB_UI_PATH." >&2
  exit 1
fi

# Everything above the upstream banner is our provenance header; keep it.
header_lines=$(grep -n '^/\*$' "$VENDORED" | sed -n '2p' | cut -d: -f1)
header_lines=$((header_lines - 1))

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
head -n "$header_lines" "$VENDORED" > "$tmp"
cat "$UPSTREAM" >> "$tmp"

if diff -q "$VENDORED" "$tmp" >/dev/null; then
  echo "Design tokens are up to date."
  exit 0
fi

echo "Upstream tokens differ from the vendored copy:"
echo
diff -u "$VENDORED" "$tmp" || true
echo

if [[ "${1:-}" == "--apply" ]]; then
  cp "$tmp" "$VENDORED"
  version=$(python3 -c "import json;print(json.load(open('$BB_UI/package.json'))['version'])")
  commit=$(git -C "$BB_UI" rev-parse --short HEAD 2>/dev/null || echo unknown)
  date=$(git -C "$BB_UI" log -1 --format=%cs 2>/dev/null || date +%F)
  echo
  echo "Applied. Update the header in $VENDORED to:"
  echo "  package: @fifty-git/ui@$version"
  echo "  commit : $commit ($date)"
else
  echo "Run with --apply to write these changes."
  exit 1
fi
