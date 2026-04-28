#!/usr/bin/env bash
set -euo pipefail

# Render Static Site build script (world-class safety):
# - Publishes ONLY a whitelisted set of files into ./dist (prevents dotfile/internal leakage).
# - Injects public runtime endpoints into dist/js/runtime-config.js (no hardcoded prod URLs in repo).
#
# Required Render env vars:
#   - TSTS_API_BASE (example: https://tsts-backend.onrender.com)
# Optional Render env vars:
#   - TSTS_CLOUDINARY_URL
#
# Render settings (manual, one-time):
#   - Build Command: bash render-build.sh
#   - Publish Directory: dist

ROOT="$(cd "$(dirname "$0")" && pwd)"
DIST="$ROOT/dist"

API_BASE_RAW="${TSTS_API_BASE:-}"
CLOUDINARY_RAW="${TSTS_CLOUDINARY_URL:-}"

if [ -z "${API_BASE_RAW}" ]; then
  echo "ERROR: Missing required env var: TSTS_API_BASE" >&2
  exit 2
fi

API_BASE="$(printf "%s" "$API_BASE_RAW" | tr -d '\r' | sed -E 's/[[:space:]]+$//; s#/$##')"
if printf "%s" "$API_BASE" | grep -Eq '/api$'; then
  API_BASE="${API_BASE%/api}"
fi

if ! printf "%s" "$API_BASE" | grep -Eq '^https?://'; then
  echo "ERROR: TSTS_API_BASE must start with http:// or https:// (got: $API_BASE_RAW)" >&2
  exit 2
fi

rm -rf "$DIST"
mkdir -p "$DIST"

# Whitelist: static public website only.
PUBLIC_FILES=(
  "404.html"
  "about.html"
  "admin.html"
  "bookmarks.html"
  "check-in.html"
  "connections.html"
  "cookie-policy.html"
  "experience.html"
  "explore.html"
  "feed.html"
  "help-center.html"
  "help-guest.html"
  "help-host.html"
  "help-platform.html"
  "host.html"
  "host-terms.html"
  "index.html"
  "login.html"
  "manifest.json"
  "my-bookings.html"
  "policy.html"
  "privacy.html"
  "profile.html"
  "public-profile.html"
  "report.html"
  "reset-password.html"
  "robots.txt"
  "settings-data.html"
  "sitemap.xml"
  "success.html"
  "terms.html"
  "unsubscribe.html"
  "verify-email.html"
  "verify-email-change.html"
)

PUBLIC_DIRS=(
  "assets"
  "css"
  "data"
  "js"
  "settings"
  "vendor"
)

for f in "${PUBLIC_FILES[@]}"; do
  if [ -f "$ROOT/$f" ]; then
    cp -p "$ROOT/$f" "$DIST/$f"
  else
    echo "ERROR: Missing expected public file: $f" >&2
    exit 2
  fi
done

for d in "${PUBLIC_DIRS[@]}"; do
  if [ -d "$ROOT/$d" ]; then
    cp -R "$ROOT/$d" "$DIST/$d"
  else
    echo "ERROR: Missing expected public dir: $d" >&2
    exit 2
  fi
done

# Remove macOS cruft if present.
find "$DIST" -name ".DS_Store" -delete || true

# Inject runtime endpoints (public, non-secret).
RUNTIME_JS="$DIST/js/runtime-config.js"
if [ ! -f "$RUNTIME_JS" ]; then
  echo "ERROR: Missing runtime config at $RUNTIME_JS" >&2
  exit 2
fi

export __TSTS_BUILD_API_BASE="$API_BASE"
export __TSTS_BUILD_CLOUDINARY_URL="$CLOUDINARY_RAW"
export RUNTIME_JS="$RUNTIME_JS"
node - <<'NODE'
const fs = require("fs");

const file = process.env.RUNTIME_JS || "";
const apiBase = String(process.env.__TSTS_BUILD_API_BASE || "").trim();
const cloud = String(process.env.__TSTS_BUILD_CLOUDINARY_URL || "").trim();

if (!file) {
  console.error("ERROR: RUNTIME_JS env missing");
  process.exit(2);
}
if (!apiBase) {
  console.error("ERROR: injected API base is empty");
  process.exit(2);
}

let s = fs.readFileSync(file, "utf8");
// Replace only the assignment sentinel (do NOT replace the compare string),
// otherwise the runtime placeholder check becomes false and apiBase never sets.
const apiLit = JSON.stringify(apiBase);
s = s.replace(/var BUILD_API_BASE = \"__TSTS_API_BASE__\";?/g, `var BUILD_API_BASE = ${apiLit};`);

// Only inject Cloudinary if provided; otherwise leave placeholder intact.
if (cloud) {
  const cloudLit = JSON.stringify(cloud);
  s = s.replace(/var BUILD_CLOUDINARY_URL = \"__TSTS_CLOUDINARY_URL__\";?/g, `var BUILD_CLOUDINARY_URL = ${cloudLit};`);
}

fs.writeFileSync(file, s);
NODE

# Defense-in-depth: never publish dotfiles/internal build artifacts.
find "$DIST" -mindepth 1 -name ".*" -exec rm -rf {} + || true
rm -f "$DIST/render-build.sh" "$DIST/package.json" "$DIST/package-lock.json" "$DIST/README.md" || true

# Additional hardening for Render environments:
# If Render is publishing root artifacts (misconfig/cached behavior), ensure sensitive root files are absent.
if [ -n "${RENDER_GIT_COMMIT:-}" ] || [ -n "${RENDER:-}" ]; then
  rm -f "$ROOT/.gitignore" "$ROOT/render-build.sh" "$ROOT/.DS_Store" || true
fi

echo "BUILD_OK"
echo "DIST=$DIST"
echo "API_BASE=$API_BASE"
