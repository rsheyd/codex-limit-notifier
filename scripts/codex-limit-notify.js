#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

const thresholdUsed = Number(process.env.CODEX_LIMIT_NOTIFY_THRESHOLD_USED || 50);
const repeatMinutes = Number(process.env.CODEX_LIMIT_NOTIFY_REPEAT_MINUTES || 60);
const notificationSound = process.env.CODEX_LIMIT_NOTIFY_SOUND || "Glass";
const bundledCodexBin = "/Applications/Codex.app/Contents/Resources/codex";
const codexBin =
  process.env.CODEX_BIN ||
  (fs.existsSync(bundledCodexBin) ? bundledCodexBin : "codex");
const statePath =
  process.env.CODEX_LIMIT_NOTIFY_STATE ||
  path.join(os.homedir(), ".codex-usage-limit-notifications", "state.json");
const dryRun = process.argv.includes("--dry-run");
const testNotify = process.argv.includes("--test-notification");

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { alerted: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function runJsonRpc() {
  return new Promise((resolve, reject) => {
    const child = spawn(codexBin, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stderr = "";
    const rl = readline.createInterface({ input: child.stdout });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Timed out waiting for Codex rate-limit response"));
    }, 30_000);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`codex app-server exited with ${code}: ${stderr.trim()}`));
      }
    });

    rl.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }

      if (message.id === 1 && message.result) {
        child.stdin.write(
          `${JSON.stringify({
            id: 2,
            method: "account/rateLimits/read",
            params: null,
          })}\n`,
        );
      }

      if (message.id === 2) {
        clearTimeout(timeout);
        child.kill("SIGTERM");
        if (message.error) {
          reject(new Error(message.error.message || JSON.stringify(message.error)));
        } else {
          resolve(message.result);
        }
      }
    });

    child.stdin.write(
      `${JSON.stringify({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "codex-limit-notifier", version: "0.1.0" },
          capabilities: { experimentalApi: true },
        },
      })}\n`,
    );
  });
}

function windowLabel(window) {
  if (window.windowDurationMins === 300) return "5h";
  if (window.windowDurationMins === 10080) return "Weekly";
  return `${window.windowDurationMins || "unknown"} min`;
}

function describeWindow(window) {
  const used = window.usedPercent;
  const remaining = Math.max(0, 100 - used);
  return `${windowLabel(window)}: ${remaining}% remaining (${used}% used)`;
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logError(message) {
  console.error(`[${new Date().toISOString()}] ${message}`);
}

function notify(title, body) {
  if (dryRun) {
    console.log(`[dry-run notification] ${title}: ${body}`);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)} sound name ${JSON.stringify(notificationSound)}`;
    const child = spawn("osascript", ["-e", script], { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`osascript exited with ${code}`));
    });
  });
}

function windowsFromSnapshot(snapshot) {
  const rateLimits =
    snapshot.rateLimitsByLimitId?.codex ||
    snapshot.rateLimits ||
    Object.values(snapshot.rateLimitsByLimitId || {})[0];

  if (!rateLimits) {
    throw new Error("No Codex rate-limit data found in response");
  }

  return [rateLimits.primary, rateLimits.secondary].filter(Boolean);
}

async function main() {
  if (testNotify) {
    await notify(
      "Codex usage notifier test",
      "This is only a test notification. It does not read your current Codex balance.",
    );
    return;
  }

  if (!Number.isFinite(thresholdUsed) || thresholdUsed < 0 || thresholdUsed > 100) {
    throw new Error("CODEX_LIMIT_NOTIFY_THRESHOLD_USED must be a number from 0 to 100");
  }
  if (!Number.isFinite(repeatMinutes) || repeatMinutes < 0) {
    throw new Error("CODEX_LIMIT_NOTIFY_REPEAT_MINUTES must be 0 or a positive number");
  }

  const snapshot = await runJsonRpc();
  const windows = windowsFromSnapshot(snapshot);
  const state = readState();
  state.alerted ||= {};

  log(windows.map(describeWindow).join(" | "));

  const warnings = [];
  for (const window of windows) {
    if (window.usedPercent < thresholdUsed) continue;

    const key = `${windowLabel(window)}:${thresholdUsed}:${window.resetsAt || "unknown"}`;
    if (state.alerted[key]) {
      const lastAlertedAt = Date.parse(state.alerted[key]);
      const canRepeat =
        repeatMinutes > 0 &&
        Number.isFinite(lastAlertedAt) &&
        Date.now() - lastAlertedAt >= repeatMinutes * 60 * 1000;
      if (!canRepeat) continue;
    }

    state.alerted[key] = new Date().toISOString();
    warnings.push(describeWindow(window));
  }

  if (warnings.length > 0) {
    await notify(
      "Codex usage limit warning",
      `${warnings.join("; ")}. Threshold: ${thresholdUsed}% used.`,
    );
  }

  writeState(state);
}

main().catch((error) => {
  logError(error.message);
  process.exitCode = 1;
});
