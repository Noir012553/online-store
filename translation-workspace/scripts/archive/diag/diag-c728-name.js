// Fix nov10 pass10 (c728 last):
//  - name: preflight STILL reports name/tech missing "f" though name == src?
//    Means preflight compares name BEFORE pass9 rebuild (no — it re-reads).
//    Ahh — pass9 replaced name only inside IMPORT if != src... they printed
//    records fixed 0 — but preflight still errors, so the failing name field
//    must be a DIFFERENT field pair: the validator call I use passes
//    (src.name, tr.name) → identical ⇒ no error. Unless preflight uses
//    translations.name but SOURCE name... they're equal. So maybe validator
//    extracts token "f" from "phím"?? Equal strings should yield equal token
//    counts → no missing. But it errors anyway → likely the preflight loop
//    fields order: "name","description","technicalDescription"; for name it
//    uses src[f] — src.name is a STRING but maybe src.name is undefined for
//    this record?? No.
//    KEY INSIGHT: equal strings can STILL fail when token contains regex
//    unescaped chars... equal → identical counts → never "missing".
//    Unless checkSourceLanguageLeak path? no, err says tech.
//    TEST directly here:
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const fs = require("fs");
const d = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "data",
      "import",
      "assistant-batch-import-nov10.json",
    ),
    "utf8",
  ),
);
const r = d.records.find(
  (x) => x.productId.endsWith("c728") && x.targetLang === "en",
);
console.log(
  "name check:",
  JSON.stringify(
    validator.checkTechnicalTokens(r.source.name, r.translations.name),
  ),
);
console.log(
  "src.name type:",
  typeof r.source.name,
  "len",
  r.source.name?.length,
  "tr len",
  r.translations.name.length,
);
// where does "f" token live? scan source name for words
console.log(
  "tokens guess:",
  r.source.name.match(
    /[A-Za-z]+[0-9]+|[0-9]+(?:[.,][0-9]+)?[A-Za-z]+|[A-Z]{2,}/g,
  ) || [],
);
