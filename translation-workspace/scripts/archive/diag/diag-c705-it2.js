// Diagnose which phrase the validator actually catches for c705:it — run the
// leak function directly against the source and translation.
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
  (r) => r.productId.endsWith("c705") && r.targetLang === "it",
);
const wl = validator.checkSourceLanguageLeak(
  rec.source.description,
  rec.translations.description,
  "it",
  "product_description",
);
console.log("phrase:", wl && wl.phrase);
if (wl) {
  const i = rec.translations.description
    .toLowerCase()
    .replace(/\s+/g, " ")
    .indexOf(wl.phrase.toLowerCase().replace(/\s+/g, " "));
  const clean = rec.translations.description.replace(/\s+/g, " ");
  console.log("idx:", i);
  console.log(
    "ctx:",
    JSON.stringify(
      clean.slice(Math.max(0, i - 100), i + wl.phrase.length + 60),
    ),
  );
}
