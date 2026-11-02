// Root cause confirmed: embedded prefix "F" (from "F873W" = F+873+W) demands
// countWholePhrase(tr, "F") >= 1, but a standalone letter F never occurs —
// validator bug with identical strings. Workaround WITHOUT touching backend
// validation logic: make countWholePhrase pass by having "F" as a whole word.
// "F87" alone doesn't work ("F87" ≠ "F" whole). But phím→"f"? No.
// → Name must keep token parity differently: since even identical strings
//   fail, the SOURCE ITSELF is un-validatable for name... BUT the approve
//   route may validate differently (maybe it doesn't run name tokens, or
//   marks inconsistent-only). Test: run checkTechnicalTokens on desc:
const path = require("path");
const fs = require("fs");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const d = require("../data/import/assistant-batch-import-nov10.json");
for (const r of d.records.filter((x) => x.productId.endsWith("c728"))) {
  const nameErr = validator.checkTechnicalTokens(
    r.source.name,
    r.translations.name,
  );
  const descErr = validator.checkTechnicalTokens(
    r.source.description,
    r.translations.description,
  );
  const techErr = validator.checkTechnicalTokens(
    r.source.technicalDescription,
    r.translations.technicalDescription,
  );
  console.log(
    r.targetLang,
    "name:",
    JSON.stringify(nameErr),
    "desc:",
    JSON.stringify(descErr),
    "tech:",
    JSON.stringify(techErr),
  );
}
