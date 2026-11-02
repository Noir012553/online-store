// Diagnose pid prefix mismatch: my laptop hand file used wrong prefixes.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const exp = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "export", "assistant-batch-next.json"),
    "utf8",
  ),
);
const need = ["c61e", "c622", "c624", "c695", "c6a7", "c6b1", "c6b2"];
for (const r of exp.records) {
  const tail = r.productId.slice(-4);
  if (need.includes(tail)) console.log(r.productId, tail, r.targetLang);
}
