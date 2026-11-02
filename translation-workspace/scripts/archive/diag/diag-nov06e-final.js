// Diagnose the actual leaks on 4 remaining records after pass 18.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;
for (const [tail, lang] of [
  ["c7fb", "sv"],
  ["c803", "fr"],
  ["c803", "es"],
  ["c8b3", "pt"],
  ["c8c4", "fr"],
  ["c8c4", "es"],
  ["c8c5", "de"],
  ["c8c8", "de"],
  ["c8c8", "it"],
  ["c8db", "fr"],
  ["c8e1", "pt"],
  ["c8a2", "fr"],
  ["c8a2", "it"],
]) {
  const rec = importData.records.find(
    (r) => r.productId.endsWith(tail) && r.targetLang === lang,
  );
  const wl = validator.checkSourceLanguageLeak(
    rec.source.description,
    rec.translations.description || "",
    lang,
    "product_description",
  );
  const mb = validator.checkMissingBrand(
    rec.source.description,
    rec.translations.description || "",
  );
  console.log(
    tail + "/" + lang,
    "| leak:",
    wl ? wl.phrase : "-",
    "| brand:",
    mb ? mb.brand : "-",
  );
}
