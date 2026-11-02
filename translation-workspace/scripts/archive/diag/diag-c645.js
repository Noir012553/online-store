// Dump c645 source name/description and the 3 pending translations (fr/pt/sv).
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov09.json"),
    "utf8",
  ),
);
const recs = d.records.filter((r) => r.productId.slice(-4) === "c645");
const out = [];
for (const r of recs) {
  out.push(`=== ${r.targetLang} (q pending?) ===`);
  out.push(`name: ${r.translations.name}`);
  out.push(`desc:\n${r.translations.description}`);
  out.push("");
}
const src = recs[0].source;
out.push("=== SOURCE ===");
out.push(`name: ${src.name}`);
out.push(`desc:\n${src.description}`);
fs.writeFileSync(
  path.join(WS, "logs", "diag-c645.txt"),
  out.join("\n"),
  "utf8",
);
console.log("written");
