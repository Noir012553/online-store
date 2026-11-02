// Full real-validator per-field sweep over the built import file -> log file.
const path = require("path");
const fs = require("fs");
const v = require(
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
const b = require(
  path.join(
    __dirname,
    "..",
    "data",
    "import",
    "assistant-batch-import-next.json",
  ),
);
const out = [];
let n = 0;
for (const rec of b.records) {
  if (!rec.source || !rec.translations) continue;
  const pairs = [
    ["name", rec.source.name, rec.translations.name],
    ["description", rec.source.description, rec.translations.description],
    [
      "tech",
      rec.source.technicalDescription,
      rec.translations.technicalDescription,
    ],
    ...Object.entries(rec.source.specs || {}).map(([k, x]) => [
      "spec." + k,
      String(x),
      String((rec.translations.specs || {})[k] ?? ""),
    ]),
    ...(rec.source.descriptionImages || []).map((img, i) => [
      "alt." + i,
      String(img.alt || ""),
      String(((rec.translations.descriptionImages || [])[i] || {}).alt ?? ""),
    ]),
    ...(rec.source.promotions || []).map((p, i) => [
      "promo." + i,
      String(p.title || ""),
      String(((rec.translations.promotions || [])[i] || {}).title ?? ""),
    ]),
  ];
  for (const [f, s, t] of pairs) {
    if (typeof s !== "string" || !s.trim()) continue;
    // Match backend validator: skip token check for marketing prose (description).
    const r = f === "description"
      ? null
      : v.checkTechnicalTokens(s, String(t || ""));
    if (r) {
      n++;
      out.push(
        `${rec.productId.slice(-4)} ${rec.targetLang} ${f} ${JSON.stringify(r)}`,
      );
    }
  }
}
out.push("total: " + n);
fs.writeFileSync(
  path.join(__dirname, "..", "logs", "validator-sweep.txt"),
  out.join("\n"),
  "utf8",
);
console.log("total:", n, "-> logs/validator-sweep.txt");
