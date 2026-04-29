#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="local.codex-limit-notifier"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE_BIN="$(command -v node)"
BUNDLED_CODEX_BIN="/Applications/Codex.app/Contents/Resources/codex"
CODEX_BIN="${CODEX_BIN:-}"
CHECK_INTERVAL_SECONDS="${CODEX_LIMIT_NOTIFY_CHECK_INTERVAL_SECONDS:-300}"
LAUNCHD_PATH="$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
LOG_PATH="$HOME/Library/Logs/codex-limit-notifier.log"

if [[ -z "$CODEX_BIN" ]]; then
  if [[ -x "$BUNDLED_CODEX_BIN" ]]; then
    CODEX_BIN="$BUNDLED_CODEX_BIN"
  elif command -v codex >/dev/null 2>&1; then
    CODEX_BIN="$(command -v codex)"
  else
    CODEX_BIN="codex"
  fi
fi

if ! [[ "$CHECK_INTERVAL_SECONDS" =~ ^[0-9]+$ ]] || [[ "$CHECK_INTERVAL_SECONDS" -lt 60 ]]; then
  echo "CODEX_LIMIT_NOTIFY_CHECK_INTERVAL_SECONDS must be an integer >= 60" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/Library/Logs"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$ROOT_DIR/scripts/codex-limit-notify.js</string>
  </array>

  <key>StartInterval</key>
  <integer>$CHECK_INTERVAL_SECONDS</integer>

  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/codex-limit-notifier.log</string>

  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/codex-limit-notifier.err.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$LAUNCHD_PATH</string>
    <key>CODEX_LIMIT_NOTIFY_THRESHOLD_USED</key>
    <string>${CODEX_LIMIT_NOTIFY_THRESHOLD_USED:-50}</string>
    <key>CODEX_LIMIT_NOTIFY_REPEAT_MINUTES</key>
    <string>${CODEX_LIMIT_NOTIFY_REPEAT_MINUTES:-10}</string>
    <key>CODEX_LIMIT_NOTIFY_SOUND</key>
    <string>${CODEX_LIMIT_NOTIFY_SOUND:-Glass}</string>
    <key>CODEX_BIN</key>
    <string>$CODEX_BIN</string>
  </dict>
</dict>
</plist>
PLIST

launchctl unload "$PLIST" >/dev/null 2>&1 || true
launchctl load "$PLIST"

{
  printf '[%s] Installed %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$LABEL"
  printf '[%s] Settings: threshold_used=%s repeat_minutes=%s check_interval_seconds=%s sound=%s codex_bin=%s node_bin=%s\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    "${CODEX_LIMIT_NOTIFY_THRESHOLD_USED:-50}" \
    "${CODEX_LIMIT_NOTIFY_REPEAT_MINUTES:-10}" \
    "$CHECK_INTERVAL_SECONDS" \
    "${CODEX_LIMIT_NOTIFY_SOUND:-Glass}" \
    "$CODEX_BIN" \
    "$NODE_BIN"
} >> "$LOG_PATH"

echo "Installed $LABEL"
echo "Runs every $CHECK_INTERVAL_SECONDS seconds. Logs:"
echo "  $HOME/Library/Logs/codex-limit-notifier.log"
echo "  $HOME/Library/Logs/codex-limit-notifier.err.log"
