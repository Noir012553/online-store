// Final pre-import validation run through backend validateTranslation on
// EVERY record of the nov06d batch, reporting per-record errors exactly like
// the import endpoint would.
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const fs = require("fs");
const WS = path.join(__dirname, "..");
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06d.json"),
    "utf8",
  ),
);

(async () => {
  let badCount = 0;
  for (const rec of importData.records) {
    const lang = rec.targetLang;
    const errors = [];
    const pairs = [
      ["name", rec.source.name, rec.translations.name, "product_name"],
      [
        "desc",
        rec.source.description,
        rec.translations.description,
        "product_description",
      ],
      [
        "tech",
        rec.source.technicalDescription,
        rec.translations.technicalDescription,
        "product_technical_description",
      ],
    ];
    for (const [field, s, t, type] of pairs) {
      if (typeof s !== "string" || !s.trim()) continue;
      const v = await validator.validateTranslation(
        s,
        String(t || ""),
        lang,
        type,
      );
      for (const e of v.validationErrors || []) errors.push(`${field}:${e}`);
    }
    if (errors.length) {
      console.log(rec.productId.slice(-4) + "/" + lang, errors.join(" | "));
      badCount++;
    }
  }
  console.log(
    badCount ? badCount + " records have validator errors" : "ALL CLEAN",
  );
})();
