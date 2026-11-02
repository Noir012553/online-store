// Fix pass 12 — all 20 brandOk=true, so "missing_brand" must come from
// checkMissingBrand, not a plain string check. Likely checkMissingBrand uses
// the PRESERVED_BRANDS list and checks brand NAMES in translations of
// name+description. Maybe validator's brand for Logitech is "Logitech" —
// mine has "Logitech". So which brand token is missing? Print
// checkMissingBrand(s, t) output from validator directly for one record.
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
  "assistant-batch-import-nov06d.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const rec = importData.records.find(
  (r) => r.productId.endsWith("c869") && r.targetLang === "fr",
);
console.log(
  "checkMissingBrand desc:",
  JSON.stringify(
    validator.checkMissingBrand(
      rec.source.description,
      rec.translations.description,
    ),
  ),
);
console.log(
  "checkMissingBrand name:",
  JSON.stringify(
    validator.checkMissingBrand(rec.source.name, rec.translations.name),
  ),
);
