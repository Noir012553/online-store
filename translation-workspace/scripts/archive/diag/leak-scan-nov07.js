// Find exact mixed_language leak phrases using the REAL backend validator.
const path = require("path");
const batch = require(
  path.join(
    __dirname,
    "..",
    "data",
    "import",
    "assistant-batch-import-nov07.json",
  ),
);
const validator = require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "src",
    "utils",
    "translationValidator.js",
  ),
);
const config = require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "src",
    "config",
    "translationValidation.js",
  ),
);

const leaks = [];
const only = (process.env.ONLY_FROM || 0);
const onlyTo = (process.env.ONLY_TO || batch.records.length);
for (let idx = only; idx < Math.min(onlyTo, batch.records.length); idx++) {
  const rec = batch.records[idx];
  if (!rec.source || !rec.translations || !rec.translations.name) continue;
  const pairs = [
    ["name", rec.source.name, rec.translations.name],
    ["description", rec.source.description, rec.translations.description],
    [
      "technicalDescription",
      rec.source.technicalDescription,
      rec.translations.technicalDescription,
    ],
    ...Object.entries(rec.source.specs || {}).map(([k, v]) => [
      `spec.${k}`,
      String(v),
      String(rec.translations.specs?.[k] ?? ""),
    ]),
  ];
  for (const [field, src, tr] of pairs) {
    const r = validator.checkSourceLanguageLeak(
      String(src),
      String(tr),
      rec.targetLang,
      "product_description",
    );
    if (r)
      leaks.push(
        `${rec.productId.slice(-4)}/${rec.targetLang} ${field}: phrase="${r.phrase}"`,
      );
  }
}
console.log("leaks:", leaks.length);
leaks.forEach((i) => console.log(" -", i));
require("fs").writeFileSync(
  path.join(__dirname, "..", "logs", "leak-scan-last.txt"),
  leaks.join("\n") + `\nscan range [${only},${onlyTo})\n`,
  "utf8",
);

