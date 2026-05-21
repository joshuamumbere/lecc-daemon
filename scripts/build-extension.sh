#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTENSION_DIR="$ROOT_DIR/extension"
DIST_DIR="$ROOT_DIR/dist"
PACKAGE_NAME="$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).name")"
PACKAGE_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")"
MANIFEST_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('extension/manifest.json', 'utf8')).version")"
ARCHIVE_NAME="${PACKAGE_NAME}-extension-v${PACKAGE_VERSION}.zip"
ARCHIVE_PATH="$DIST_DIR/$ARCHIVE_NAME"

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required to build the extension archive" >&2
  exit 1
fi

if [ "$PACKAGE_VERSION" != "$MANIFEST_VERSION" ]; then
  echo "package.json version ($PACKAGE_VERSION) must match extension/manifest.json version ($MANIFEST_VERSION)" >&2
  exit 1
fi

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

(
  cd "$EXTENSION_DIR"
  zip -X -r "$ARCHIVE_PATH" . \
    -x '*.DS_Store' \
    -x '__MACOSX/*'
)

echo "Built $ARCHIVE_PATH"
