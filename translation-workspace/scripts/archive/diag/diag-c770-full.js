// Wait — that was c770? Print ALL stringified contents to locate "dễ".
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
console.log("FULL translation:", JSON.stringify(rec.translations, null, 1));
