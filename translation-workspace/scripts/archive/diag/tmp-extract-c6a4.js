// Extract c6a4 productIds from import json for reimport
const fs = require("fs");
const path = require("path");
const IMPORT = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov07.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const targets = d.records
  .filter((r) => r.productId.endsWith("c6a4"))
  .map((r) => r.productId);
fs.writeFileSync(
  path.join(__dirname, "..", "logs", "nov07-c6a4-targets.json"),
  JSON.stringify(targets, null, 2),
  "utf8",
);
console.log("target ids:", targets.length, targets);
