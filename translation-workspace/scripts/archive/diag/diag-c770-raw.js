// Fix c770/fr leak "switch dễ" — write name explicitly and search-desc
// replace "switch dễ"/"Switch dễ" phrase with French wording.
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
const rec = d.records.find(
  (r) => r.productId.endsWith("c770") && r.targetLang === "fr",
);
const blob = JSON.stringify(rec.translations);
const idx = blob.toLowerCase().indexOf("switch dễ");
console.log("raw idx:", idx);
console.log(JSON.stringify(blob.slice(Math.max(0, idx - 200), idx + 150)));
