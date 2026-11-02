// Diagnose remaining pending again with an inline report, updated import file.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const TAIL_LANGS = [];
for (const r of importData.records)
  TAIL_LANGS.push([r.productId.slice(-4), r.targetLang]);
for (const [tail, lang] of TAIL_LANGS) {
  const rec = importData.records.find(
    (r) => r.productId.endsWith(tail) && r.targetLang === lang,
  );
  if (!rec) continue;
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
    "| hasIntel:",
    (rec.translations.description || "").includes("Intel"),
  );
}
