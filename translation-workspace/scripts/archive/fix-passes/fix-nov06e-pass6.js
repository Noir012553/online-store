// Verify remaining leaks after pass5 — rebuild import from hand then sweep.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const HAND = path.join(WS, "data", "translations", "translations-nov06e-hand.json");
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const importData = JSON.parse(fs.readFileSync(path.join(WS, "data", "import", "assistant-batch-import-nov06e.json"), "utf8"));
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(path.join(BACKEND, "src", "utils", "translationValidator.js"));

for (const rec of importData.records) {
  const h = hand[rec.productId] && hand[rec.productId][rec.targetLang];
  if (h) rec.translations = h;
}
fs.writeFileSync(
  path.join(WS, "data", "import", "assistant-batch-import-nov06e.json"),
  JSON.stringify(importData, null, 2),
  "utf8",
);

const out = [];
let leaks = 0;
for (const rec of importData.records) {
  const lang = rec.targetLang;
  const wl = validator.checkSourceLanguageLeak(
    rec.source.description,
    rec.translations.description || "",
    lang,
    "product_description",
  );
  if (wl) {
    leaks++;
    out.push(`LEAK ${rec.productId.slice(-4)}/${lang} ${JSON.stringify(wl.phrase)}`);
  }
}
out.push(`total leaks: ${leaks}`);
fs.appendFileSync(path.join(WS, "logs", "verify-nov06e.txt"), out.join("\n") + "\n", "utf8");
console.log(out.join("\n"));
