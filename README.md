# Codex Usage Limit Notifications

**Deprecated**: Both the codex desktop app and the CodexBar now have built-in notifications. This app still works at the moment (6/29/2026) but is no longer necessary and will not be maintained going forward.

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

- Checks every 5 minutes.
- Warns when the 5-hour limit reaches `60%` used, which is the same as `40%` remaining.
- Warns when the weekly limit reaches `80%` used, which is the same as `20%` remaining.
- Repeats the warning every 10 minutes while a limit remains over threshold.
- Uses a macOS desktop notification with the `Glass` sound.

## Install and Configure

```sh
git clone https://github.com/rsheyd/codex-limit-notifier.git
cd codex-limit-notifier
chmod +x scripts/*.sh scripts/codex-limit-notify.js scripts/codex-limit-snooze
./scripts/install-launchd.sh
```

This installs and loads:

```text
~/Library/LaunchAgents/local.codex-limit-notifier.plist
```

Rerun the installer with any settings you want to change. Each install rewrites and reloads the LaunchAgent.

```sh
CODEX_LIMIT_NOTIFY_THRESHOLD_USED=60 \
CODEX_LIMIT_NOTIFY_5H_THRESHOLD_USED=60 \
CODEX_LIMIT_NOTIFY_WEEKLY_THRESHOLD_USED=80 \
CODEX_LIMIT_NOTIFY_REPEAT_MINUTES=10 \
CODEX_LIMIT_NOTIFY_CHECK_INTERVAL_SECONDS=300 \
CODEX_LIMIT_NOTIFY_SOUND=Glass \
./scripts/install-launchd.sh
```

Settings:

- `CODEX_LIMIT_NOTIFY_THRESHOLD_USED`: default alert threshold as percent used for windows without a more specific setting. It also remains the fallback for the 5-hour threshold. Example: `75` means warn at `25%` remaining.
- `CODEX_LIMIT_NOTIFY_5H_THRESHOLD_USED`: 5-hour alert threshold as percent used. Defaults to `60`.
- `CODEX_LIMIT_NOTIFY_WEEKLY_THRESHOLD_USED`: weekly alert threshold as percent used. Defaults to `80`.
- `CODEX_LIMIT_NOTIFY_REPEAT_MINUTES`: how often to notify again while still over threshold. Use `0` to disable repeats.
- `CODEX_LIMIT_NOTIFY_CHECK_INTERVAL_SECONDS`: how often launchd runs the monitor. Minimum is `60`.
- `CODEX_LIMIT_NOTIFY_SOUND`: macOS notification sound name.
- `CODEX_BIN`: optional path to Codex if installed somewhere unusual.

The installer prefers the bundled Codex app binary at `/Applications/Codex.app/Contents/Resources/codex`, because that is more reliable under launchd than shell shims installed by version managers.

Optional: install the helper commands somewhere on your `PATH`.
This example uses `~/.local/bin`, which avoids `sudo` and is usually safer than `/usr/local/bin`:

```sh
mkdir -p "$HOME/.local/bin"
ln -sf "$PWD/scripts/codex-limit-snooze" "$HOME/.local/bin/codex-limit-snooze"
ln -sf "$PWD/scripts/codex-limit-weekly-threshold" "$HOME/.local/bin/codex-limit-weekly-threshold"
```

Run these commands from the repository root so `$PWD/scripts/...` points at this checkout.

Then you can snooze reminders from anywhere:

```sh
codex-limit-snooze 1h
codex-limit-snooze 30m
codex-limit-snooze off
codex-limit-snooze status
```

Adjust the weekly threshold without reinstalling the LaunchAgent:

```sh
codex-limit-weekly-threshold 85
codex-limit-weekly-threshold status
codex-limit-weekly-threshold reset
```

This writes an override to the notifier state file. `reset` clears the override and returns to `CODEX_LIMIT_NOTIFY_WEEKLY_THRESHOLD_USED`, or the built-in `80%` default.

For one-click snooze, create a macOS Shortcut with a "Run Shell Script" action:

```sh
$HOME/.local/bin/codex-limit-snooze 1h
```

You can name it "Snooze Codex Alerts 1h" and run it from Spotlight, Shortcuts, Siri, Raycast, Alfred, or a keyboard shortcut.

Check installed settings:

```sh
plutil -p ~/Library/LaunchAgents/local.codex-limit-notifier.plist
```

Look under `EnvironmentVariables` for the notification settings. Look at `StartInterval` for the check interval.

Check interval and repeat interval are intentionally separate. You can check every 5 minutes but only repeat notifications every 10 minutes:

```sh
CODEX_LIMIT_NOTIFY_CHECK_INTERVAL_SECONDS=300 \
CODEX_LIMIT_NOTIFY_REPEAT_MINUTES=10 \
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

Snooze notifications:

```sh
node scripts/codex-limit-notify.js --snooze 1h
node scripts/codex-limit-notify.js --status
node scripts/codex-limit-notify.js --unsnooze
```

Test the real threshold path with a temporary low threshold:

```sh
CODEX_LIMIT_NOTIFY_THRESHOLD_USED=1 \
CODEX_LIMIT_NOTIFY_WEEKLY_THRESHOLD_USED=1 \
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
