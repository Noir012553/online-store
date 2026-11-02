// Diagnose c6f8/it remaining validation failure with the REAL backend validator
// full validateTranslation call (not just my partial sweeps).
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const fs = require("fs");
const importData = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "data",
      "import",
      "assistant-batch-import-nov06c.json",
    ),
    "utf8",
  ),
);
const rec = importData.records.find(
  (r) => r.productId.endsWith("c6f8") && r.targetLang === "it",
);

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
  // alts
  for (const [i, img] of (rec.source.descriptionImages || []).entries()) {
    const alt = String(img.alt || "");
    if (!alt.trim()) continue;
    const ta = (rec.translations.descriptionImages || [])[i] || {};
    const v = await validator.validateTranslation(
      alt,
      String(ta.alt ?? ""),
      "it",
      "product_description_image_alt",
    );
    if ((v.validationErrors || []).length)
      console.log(
        "alt." + i,
        JSON.stringify(v.validationErrors),
        JSON.stringify(String(ta.alt ?? "").slice(0, 80)),
      );
  }
})();
