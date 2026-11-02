// Diagnose c898/it remaining validation failure with the REAL backend validator
// (the c898 record is a Veekos wireless accessory: my Italian translation is
// missing the brand token AND the VN bigram "Kết/kết" is left untranslated).
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const fs = require("fs");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const rec = hand["6ad0d0390069aece85a8c898"].it;

(async () => {
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
    ["brand", rec.source.brand, rec.translations.brand, "product_brand"],
  ];
  for (const [field, s, t2, type] of pairs) {
    const v = await validator.validateTranslation(
      s,
      String(t2 || ""),
      "it",
      type,
    );
    console.log(
      field,
      JSON.stringify(v.validationErrors),
      "score",
      v.qualityScore,
    );
  }
})();
