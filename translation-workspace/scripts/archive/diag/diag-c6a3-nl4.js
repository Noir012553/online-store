// Diagnose the actual bigram the validator catches. Show the validator
// source or dump the normalized source around the phrase to understand
// which bigram the search is doing.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06e.json"),
    "utf8",
  ),
);
const rec = importData.records.find(
  (r) => r.productId.endsWith("c6a3") && r.targetLang === "nl",
);
const wl = validator.checkSourceLanguageLeak(
  rec.source.description,
  rec.translations.description,
  "nl",
  "product_description",
);
console.log("phrase:", wl && wl.phrase);
console.log("source name:", JSON.stringify(rec.source.name.slice(0, 130)));
// look for "để asus" in source description
const i = rec.source.description.toLowerCase().indexOf("asus tuf gaming");
console.log(
  "src ctx:",
  JSON.stringify(rec.source.description.slice(Math.max(0, i - 150), i + 130)),
);
