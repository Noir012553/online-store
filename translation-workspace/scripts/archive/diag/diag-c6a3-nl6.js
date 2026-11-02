// Final nl patch for c6a3: locate exact "để asus tuf gaming" leak and rewrite.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);

const file = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const data = JSON.parse(fs.readFileSync(file, "utf8"));
let target = null,
  targetPid = null;
for (const [pid, langs] of Object.entries(data)) {
  if (!pid.endsWith("c6a3")) continue;
  for (const lang of Object.keys(langs)) {
    if (lang === "nl") {
      target = langs.nl;
      targetPid = pid;
    }
  }
}
if (!target) {
  console.error("c6a3/nl entry not found in hand file");
  process.exit(1);
}
let desc = target.description;
let idx = desc.toLowerCase().indexOf("de asus tuf gaming");
if (idx < 0) idx = desc.toLowerCase().indexOf("để asus tuf gaming");
console.log("idx:", idx);
if (idx >= 0) {
  console.log(
    "ctx:",
    JSON.stringify(desc.slice(Math.max(0, idx - 200), idx + 160)),
  );
} else {
  console.log("phrase absent from hand file — checking import json instead");
}
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06e.json"),
    "utf8",
  ),
);
const rec = importData.records.find(
  (r) => r.productId.endsWith("c6a3") && r.targetLang === "nl",
);
const leak = validator.checkSourceLanguageLeak(
  rec.source.description,
  rec.translations.description,
  "nl",
  "product_description",
);
console.log("validator leak:", leak && leak.phrase);
