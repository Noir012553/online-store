// Monitor the running storefront retranslation (PID from logs\monitor-target.txt).
// Writes a UTF-8 status snapshot to logs\retranslate-monitor-latest.txt every cycle
// (default 300s) so Vietnamese text renders correctly when read back from file.
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(__dirname, "retranslate-monitor-latest.txt");
const HISTORY = path.join(__dirname, "retranslate-monitor-history.log");
const INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS || 300000);
const TARGET_CMD = "retranslate-storefront-backlog.js";

const findTargetPid = () => {
  try {
    const rows = JSON.parse(
      execSync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Select-Object ProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress"',
        { encoding: "utf8" },
      ),
    );
    const list = Array.isArray(rows) ? rows : [rows];
    const hit = list.find((row) =>
      String(row.CommandLine || "").includes(TARGET_CMD),
    );
    return hit ? Number(hit.ProcessId) : null;
  } catch {
    return null;
  }
};

const getProcessInfo = (pid) => {
  try {
    const rows = JSON.parse(
      execSync(
        `powershell -NoProfile -Command "Get-Process -Id ${pid} | Select-Object Id,CPU,WorkingSet64 | ConvertTo-Json -Compress"`,
        { encoding: "utf8" },
      ),
    );
    return Array.isArray(rows) ? rows[0] : rows;
  } catch {
    return null;
  }
};

const snapshot = () => {
  const now = new Date().toISOString();
  const pid = findTargetPid();
  let lines = [`=== ${now} ===`];
  if (!pid) {
    lines.push("STATUS: RUNNING_PROCESS_GONE");
    lines.push(
      "The retranslate-storefront-backlog.js process is no longer running.",
    );
    lines.push(
      "If --shutdown was set and the run finished cleanly/completed, the machine",
    );
    lines.push(
      "may have shut down; otherwise check logs/retranslate output or rerun the script.",
    );
  } else {
    const info = getProcessInfo(pid);
    lines.push(`STATUS: RUNNING (pid ${pid})`);
    lines.push(
      `CPU seconds: ${info ? Number(info.CPU || 0).toFixed(1) : "n/a"}  RAM: ${info ? (info.WorkingSet64 / 1048576).toFixed(0) + " MB" : "n/a"}`,
    );
  }
  const text = lines.join("\n");
  fs.writeFileSync(OUT_FILE, text, "utf8");
  fs.appendFileSync(HISTORY, text + "\n", "utf8");
  console.log(text);
};

console.log(
  `Monitoring "${TARGET_CMD}" every ${INTERVAL_MS / 1000}s. Reports: ${OUT_FILE}`,
);
snapshot();
setInterval(snapshot, INTERVAL_MS);
