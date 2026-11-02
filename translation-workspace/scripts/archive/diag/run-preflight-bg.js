// Run preflight in background detached.
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const SCRIPT = path.join(WS, "scripts", "preflight-nov08.js");
const out = fs.openSync(path.join(WS, "logs", "preflight-nov08-last.txt"), "w");
const err = fs.openSync(path.join(WS, "logs", "preflight-nov08-err.txt"), "w");
const p = spawn("node", [SCRIPT], {
  shell: false,
  detached: true,
  stdio: ["ignore", out, err],
});
p.unref();
console.log("pid:", p.pid);
