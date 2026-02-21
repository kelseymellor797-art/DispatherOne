#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${ROOT_DIR}/src-tauri/target/release/bundle/macos/DispatcherOne.app"
DMG_PATH="${ROOT_DIR}/src-tauri/target/release/bundle/dmg/DispatcherOne_0.1.0_aarch64.dmg"
DMG_SCRIPT="${ROOT_DIR}/src-tauri/target/release/bundle/dmg/bundle_dmg.sh"
TMP_DIR="/tmp/dispatcherone_dmg"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "Missing app bundle at ${APP_PATH}. Run: npm run tauri build -- --bundles app"
  exit 1
fi

rm -rf "${TMP_DIR}"
mkdir -p "${TMP_DIR}"
cp -R "${APP_PATH}" "${TMP_DIR}/DispatcherOne.app"

set +e
"${DMG_SCRIPT}" \
  --sandbox-safe \
  --volname "DispatcherOne" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 128 \
  --icon "DispatcherOne.app" 170 200 \
  --app-drop-link 430 200 \
  "${DMG_PATH}" \
  "${TMP_DIR}"
status=$?
set -e

if [[ $status -ne 0 ]]; then
  echo "DMG creation failed. If you see hdiutil permission errors, rerun with sudo:"
  echo "  sudo ${ROOT_DIR}/scripts/build_macos_dmg.sh"
  exit $status
fi

echo "DMG created at ${DMG_PATH}"
