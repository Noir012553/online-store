// Find every record in import file whose translation still contains "dễ".
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
for (const r of d.records) {
  const blob = JSON.stringify(r.translations).toLowerCase();
  const m = blob.match(/.{0,60}dễ.{0,60}/g);
  if (m)
    console.log(r.productId.slice(-4) + "/" + r.targetLang, JSON.stringify(m));
}
