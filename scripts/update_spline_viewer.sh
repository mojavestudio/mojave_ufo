#!/usr/bin/env bash
set -euo pipefail

# Update the vendored @splinetool/viewer build files to a pinned version.
# Usage: ./scripts/update_spline_viewer.sh [version]
# Example: ./scripts/update_spline_viewer.sh 1.10.73

VER="${1:-1.10.73}"
BASE_URL="https://unpkg.com/@splinetool/viewer@${VER}/build"
DEST="vendor/spline-viewer/build"

echo "Vendoring @splinetool/viewer@${VER} into ${DEST}"
mkdir -p "${DEST}"

FILES=(
  boolean.js
  gaussian-splat-compression.js
  howler.js
  navmesh.js
  opentype.js
  physics.js
  process.js
  spline-viewer.js
  ui.js
)

for f in "${FILES[@]}"; do
  echo "- Fetching ${f}"
  curl -fL --silent --show-error -o "${DEST}/${f}" "${BASE_URL}/${f}"
done

# process.wasm is not published under /build on unpkg for some versions.
# The viewer's process.js expects process.wasm to be in the same folder.
if curl -I -fsSL "${BASE_URL}/process.wasm" >/dev/null 2>&1; then
  echo "- Fetching process.wasm"
  curl -fL --silent --show-error -o "${DEST}/process.wasm" "${BASE_URL}/process.wasm"
elif [[ -f process.wasm ]]; then
  echo "- Copying local process.wasm -> ${DEST}/process.wasm"
  cp -f process.wasm "${DEST}/process.wasm"
else
  echo "WARNING: process.wasm not found on CDN or repo root. The viewer may fail to initialize." >&2
fi

echo "Done. Files in ${DEST}:"
ls -lh "${DEST}" | awk '{print $5, $9}'

