// Fix pass 16 — c8a2/it: validator says source name contains "iPad" but translation
// lacks it. Inspect source + translation to find the right spot.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const SRC = path.join(WS, "data", "export", "assistant-batch-next.json");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const s = src.records.find(
  (x) =>
    x.productId.endsWith("c8a2") ||
    (x.productId && x.productId.includes && x.productId.includes("c8a2")),
);
console.log("src record:", s ? s.productId : "not found");
if (s) console.log("name:", s.source?.name || s.name || "?");
const r = d.records.find(
  (x) => x.productId.endsWith("c8a2") && x.targetLang === "it",
);
console.log("it name:", r.translations.name);
console.log("it desc first 300:", r.translations.description.slice(0, 300));
