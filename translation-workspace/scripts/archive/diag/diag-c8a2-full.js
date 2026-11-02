// Search all fields + hidden chars for "rose đi" in c8a2.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const rec = importData.records.find(
  (r) => r.productId.endsWith("c8a2") && r.targetLang === "it",
);
console.log(JSON.stringify(rec, null, 2).slice(0, 4000));
