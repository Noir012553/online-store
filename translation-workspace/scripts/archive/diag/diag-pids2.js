// Fix 3 missing records: c806 fr, c807 de (Laptop), c848 it already handled by HAND_C848 (keys mismatch? verify exact pid).
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");

// Check exact PID of c848 in export (probably 6ad0d4730069aece85a8c848, not 6ad0cc340069...)
const DATA = path.join(WS, "data");
const exp = JSON.parse(
  fs.readFileSync(
    path.join(DATA, "export", "assistant-batch-next.json"),
    "utf8",
  ),
);
for (const pidTail of ["c806", "c807", "c848"]) {
  const r = exp.records.find((x) => x.productId.endsWith(pidTail));
  console.log(pidTail, "->", r && r.productId);
}
