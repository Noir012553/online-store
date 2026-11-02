// Full real-validator sweep for the nov06b batch (incl. mixed-language, alts, promos).
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.join(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);

const b = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06c.json"),
    "utf8",
  ),
);
const problems = [];
for (const rec of b.records) {
  if (!rec.source || !rec.translations || !rec.translations.name) {
    problems.push(`${rec.productId}/${rec.targetLang}: RECORD UNFILLED`);
    continue;
  }
  const src = rec.source,
    tr = rec.translations;
  const lang = rec.targetLang;
  const pairs = [
    ["name", src.name, tr.name, "product_name"],
    ["description", src.description, tr.description, "product_description"],
    ["brand", src.brand, tr.brand, "product_brand"],
    [
      "technicalDescription",
      src.technicalDescription,
      tr.technicalDescription,
      "product_technical_description",
    ],
    ...Object.entries(src.specs || {}).map(([k, v]) => [
      `spec.${k}`,
      String(v),
      String((tr.specs || {})[k] ?? ""),
      "product_spec",
    ]),
  ];
  for (const [field, s, t, type] of pairs) {
    if (typeof s !== "string" || !s.trim()) continue;
    const r =
      field === "description"
        ? null
        : validator.checkTechnicalTokens(s, String(t || ""));
    if (r)
      problems.push(
        `${rec.productId.slice(-4)}/${lang} ${field}: ${r.error} "${r.token}"`,
      );
    const wl = validator.checkSourceLanguageLeak(
      s,
      String(t || ""),
      lang,
      type,
    );
    if (wl)
      problems.push(
        `${rec.productId.slice(-4)}/${lang} ${field}: mixed_language "${wl.phrase}"`,
      );
    const mb = validator.checkMissingBrand
      ? validator.checkMissingBrand(s, String(t || ""))
      : null;
    if (mb)
      problems.push(
        `${rec.productId.slice(-4)}/${lang} ${field}: missing_brand`,
      );
  }
  (src.descriptionImages || []).forEach((img, i) => {
    const alt = String(img.alt || "");
    if (!alt.trim()) return;
    const ta = (tr.descriptionImages || [])[i] || {};
    const r = validator.checkTechnicalTokens(alt, String(ta.alt ?? ""));
    if (r)
      problems.push(
        `${rec.productId.slice(-4)}/${lang} alt.${i}: ${r.error} "${r.token}"`,
      );
    const wl = validator.checkSourceLanguageLeak(
      alt,
      String(ta.alt ?? ""),
      lang,
      "product_description_image_alt",
    );
    if (wl)
      problems.push(
        `${rec.productId.slice(-4)}/${lang} alt.${i}: mixed_language "${wl.phrase}"`,
      );
  });
  (src.promotions || []).forEach((p, i) => {
    const tp = (tr.promotions || [])[i] || {};
    for (const f of ["title", "giftProductName"]) {
      const s = String(p[f] || ""),
        t2 = String(tp[f] || "");
      if (!s.trim() || !t2.trim()) continue;
      const r = validator.checkTechnicalTokens(s, t2);
      if (r)
        problems.push(
          `${rec.productId.slice(-4)}/${lang} promo.${i}.${f}: ${r.error} "${r.token}"`,
        );
      const wl = validator.checkSourceLanguageLeak(
        s,
        t2,
        lang,
        "product_promotion",
      );
      if (wl)
        problems.push(
          `${rec.productId.slice(-4)}/${lang} promo.${i}.${f}: mixed_language "${wl.phrase}"`,
        );
    }
  });
}
console.log("problems:", problems.length);
problems.slice(0, 60).forEach((p) => console.log(" -", p));
fs.writeFileSync(
  path.join(WS, "logs", "preflight-nov06c.txt"),
  problems.join("\n"),
  "utf8",
);
