# Codex Usage Limit Notifications

macOS desktop notifications for Codex subscription rate limits.

This monitor reads the same Codex app-server rate-limit snapshot used by the Codex app and warns when either the 5-hour or weekly Codex usage window crosses a configured threshold.

This is an unofficial local helper. It uses Codex's local app-server protocol, not the public OpenAI API. That makes it useful for the Codex app balance, but it may need updates if Codex changes that internal protocol.

If you want a live menu bar indicator instead of threshold notifications, use [CodexBar](https://github.com/steipete/CodexBar).

## Table of Contents

- [Requirements and Defaults](#requirements-and-defaults)
- [Install and Configure](#install-and-configure)
- [Test and Operate](#test-and-operate)
- [Uninstall](#uninstall)

## Requirements and Defaults

Requirements:

- macOS
- Codex installed and logged in
- Node.js available on `PATH`
- macOS notifications enabled for the script host, such as Terminal, iTerm, or your shell runner

Defaults:

- Checks every 15 minutes.
- Warns when either limit reaches `50%` used, which is the same as `50%` remaining.
- Repeats the warning every 60 minutes while a limit remains over threshold.
- Uses a macOS desktop notification with the `Glass` sound.

## Install and Configure

```sh
git clone <repo-url>
cd codex-usage-limit-notifications
chmod +x scripts/*.sh scripts/codex-limit-notify.js
./scripts/install-launchd.sh
```

This installs and loads:

```text
~/Library/LaunchAgents/local.codex-limit-notifier.plist
```

Rerun the installer with any settings you want to change. Each install rewrites and reloads the LaunchAgent.

```sh
CODEX_LIMIT_NOTIFY_THRESHOLD_USED=60 \
CODEX_LIMIT_NOTIFY_REPEAT_MINUTES=30 \
CODEX_LIMIT_NOTIFY_CHECK_INTERVAL_SECONDS=300 \
CODEX_LIMIT_NOTIFY_SOUND=Glass \
./scripts/install-launchd.sh
```

Settings:

- `CODEX_LIMIT_NOTIFY_THRESHOLD_USED`: alert threshold as percent used. Example: `75` means warn at `25%` remaining.
- `CODEX_LIMIT_NOTIFY_REPEAT_MINUTES`: how often to notify again while still over threshold. Use `0` to disable repeats.
- `CODEX_LIMIT_NOTIFY_CHECK_INTERVAL_SECONDS`: how often launchd runs the monitor. Minimum is `60`.
- `CODEX_LIMIT_NOTIFY_SOUND`: macOS notification sound name.
- `CODEX_BIN`: optional path to Codex if installed somewhere unusual.

The installer prefers the bundled Codex app binary at `/Applications/Codex.app/Contents/Resources/codex`, because that is more reliable under launchd than shell shims installed by version managers.

Check installed settings:

```sh
plutil -p ~/Library/LaunchAgents/local.codex-limit-notifier.plist
```

Look under `EnvironmentVariables` for the notification settings. Look at `StartInterval` for the check interval.

Check interval and repeat interval are intentionally separate. You can check every 5 minutes but only repeat notifications every 30 minutes:

```sh
CODEX_LIMIT_NOTIFY_CHECK_INTERVAL_SECONDS=300 \
CODEX_LIMIT_NOTIFY_REPEAT_MINUTES=30 \
./scripts/install-launchd.sh
```

## Test and Operate

Read the real Codex balance without showing a notification:

```sh
node scripts/codex-limit-notify.js --dry-run
```

Expected output:

```text
5h: 77% remaining (23% used) | Weekly: 80% remaining (20% used)
```

Test macOS notifications only:

```sh
node scripts/codex-limit-notify.js --test-notification
```

This does not read the current Codex balance and does not test the threshold logic.

Test the real threshold path with a temporary low threshold:

```sh
CODEX_LIMIT_NOTIFY_THRESHOLD_USED=1 \
CODEX_LIMIT_NOTIFY_STATE=/tmp/codex-limit-notifier-test-state.json \
node scripts/codex-limit-notify.js
rm -f /tmp/codex-limit-notifier-test-state.json
```

Because actual usage should usually be above `1%`, this should show a real macOS notification using the same code path that runs in the background.

Force launchd to run the monitor immediately:

```sh
launchctl kickstart -k gui/$(id -u)/local.codex-limit-notifier
```

View logs:

```sh
tail -f ~/Library/Logs/codex-limit-notifier.log
tail -f ~/Library/Logs/codex-limit-notifier.err.log
```

The main log includes both monitor runs and installer settings changes:

```text
[2026-04-27T01:30:50.123Z] 5h: 64% remaining (36% used) | Weekly: 78% remaining (22% used)
[2026-04-27T01:35:00Z] Settings: threshold_used=25 repeat_minutes=2 check_interval_seconds=120 sound=Glass ...
```

If notifications do not appear, check macOS notification settings for the terminal app or script host. The script sends notifications through `osascript`.

## Uninstall

```sh
./scripts/uninstall-launchd.sh
```

This removes the `local.codex-limit-notifier` LaunchAgent.
