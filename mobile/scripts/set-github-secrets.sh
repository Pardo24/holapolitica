#!/usr/bin/env bash
# Sets the GitHub Actions secrets that .github/workflows/mobile.yml needs.
#
# Run it yourself from Git Bash (gh must be logged in). Values go from local
# files or your keyboard straight to `gh secret set`; nothing is printed or
# written anywhere. Safe to re-run: secrets already on GitHub are skipped
# (FORCE=1 to overwrite), and anything whose file isn't there yet is skipped
# with a note, so run it again after the Firebase / Apple steps.
#
# Where it looks (override with env vars):
#   KEYSTORE  upload keystore             (default /c/Users/danie/keys/holapolitica-upload.jks)
#   PROPS     keystore.properties with the passwords (default: the main
#             checkout's mobile/android/keystore.properties)
#   DL        folder with files downloaded from Firebase / Apple (default ~/Downloads)
#
# See mobile/docs/store-submission.md, section 5.

set -euo pipefail

REPO="Pardo24/holapolitica"
KEYSTORE="${KEYSTORE:-/c/Users/danie/keys/holapolitica-upload.jks}"
PROPS="${PROPS:-/c/Users/danie/projects/monitor-parlamentari/mobile/android/keystore.properties}"
DL="${DL:-$HOME/Downloads}"

existing="$(gh secret list -R "$REPO" --json name -q '.[].name')"
has() { [ "${FORCE:-0}" != 1 ] && grep -qx "$1" <<<"$existing"; }
ok() { echo "  ✓ $1"; }
skip() { echo "  · $1: $2"; }

# Secret from a file, base64-encoded (binary-safe).
set_file() {
  local name="$1" file="$2"
  if has "$name"; then skip "$name" "already set"; return; fi
  if [ -z "$file" ] || [ ! -f "$file" ]; then skip "$name" "file not found yet${file:+ ($file)}"; return; fi
  base64 -w0 "$file" | gh secret set "$name" -R "$REPO" && ok "$name"
}

# Secret from a string, without a trailing newline.
set_value() {
  local name="$1" value="$2"
  if [ -z "$value" ]; then skip "$name" "no value"; return; fi
  printf '%s' "$value" | gh secret set "$name" -R "$REPO" && ok "$name"
}

# Value from keystore.properties, or asked for (hidden) if the file lacks it.
prop_or_ask() {
  local key="$1" label="$2" v=""
  [ -f "$PROPS" ] && v="$(grep -E "^$key=" "$PROPS" | head -1 | cut -d= -f2- | tr -d '\r')"
  if [ -z "$v" ]; then read -r -s -p "  $label: " v; echo >&2; fi
  printf '%s' "$v"
}

newest() { ls -t $1 2>/dev/null | head -1 || true; }

echo "Android"
set_file ANDROID_KEYSTORE_BASE64 "$KEYSTORE"
has ANDROID_KEYSTORE_PASSWORD && skip ANDROID_KEYSTORE_PASSWORD "already set" \
  || set_value ANDROID_KEYSTORE_PASSWORD "$(prop_or_ask storePassword 'Keystore password')"
has ANDROID_KEY_PASSWORD && skip ANDROID_KEY_PASSWORD "already set" \
  || set_value ANDROID_KEY_PASSWORD "$(prop_or_ask keyPassword 'Key password')"
has ANDROID_KEY_ALIAS && skip ANDROID_KEY_ALIAS "already set" \
  || set_value ANDROID_KEY_ALIAS "$( [ -f "$PROPS" ] && grep -E '^keyAlias=' "$PROPS" | cut -d= -f2- | tr -d '\r' || echo holapolitica)"
set_file GOOGLE_SERVICES_JSON_BASE64 "$(newest "$DL/google-services*.json")"

echo "iOS"
p8="$(newest "$DL/AuthKey_*.p8")"
set_file ASC_KEY_P8_BASE64 "$p8"
if has ASC_KEY_ID; then skip ASC_KEY_ID "already set"
elif [ -n "$p8" ]; then
  # The key id is in the file name Apple gives it: AuthKey_<KEYID>.p8
  kid="$(basename "$p8" .p8)"; set_value ASC_KEY_ID "${kid#AuthKey_}"
else skip ASC_KEY_ID "download the API key (.p8) first"; fi
for s in APPLE_TEAM_ID ASC_ISSUER_ID; do
  if has "$s"; then skip "$s" "already set"; continue; fi
  read -r -p "  $s (Enter to skip for now): " v
  set_value "$s" "$v"
done
set_file GOOGLE_SERVICE_INFO_PLIST_BASE64 "$(newest "$DL/GoogleService-Info*.plist")"

echo
echo "On GitHub now:"
gh secret list -R "$REPO" --json name -q '.[].name' | sed 's/^/  /'
