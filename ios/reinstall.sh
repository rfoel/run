#!/usr/bin/env bash
# Rebuild + reinstall the run app on Rafael's iPhone 17e.
# Run this whenever the dev provisioning profile expires and the app
# stops launching ("app no longer available"), or to ship a change.
#
# Usage: ios/reinstall.sh
set -euo pipefail

DEVICE_ID="00008150-000659D90A03C01C"  # Rafael's iPhone 17e
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DERIVED="$PROJECT_DIR/build"

cd "$PROJECT_DIR"

echo "==> Building (device, Debug)…"
xcodebuild -project run.xcodeproj -scheme run \
  -destination "platform=iOS,id=${DEVICE_ID}" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates build

APP_PATH="$DERIVED/Build/Products/Debug-iphoneos/run.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "!! Build product not found at: $APP_PATH" >&2
  exit 1
fi

echo "==> Installing on device…"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH"

echo "==> Done. App reinstalled: $APP_PATH"
