// Fix pass 3:
//  1. c6be/it + c6c0? — c6be had NO real VN leak ("qualità" etc. are legit
//     Italian). Validator flagged mixed_language? Actually diag showed the
//     stored errors came from validation — re-check by running the backend
//     validator directly on the payload fields to see exact rejection.
//  2. c6f8/it markup_mismatch: source description contains "&lt;=" entity;
//     translation must keep the same markup token. Add "&lt;=" back.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06c.json",
);
const importData = load(IMPORT);
const byKey = new Map(
  importData.records.map((r) => [`${r.productId}:${r.targetLang}`, r]),
);

// --- validate all 9 pending records against the real validator to see errors
const targets = [
  ["6ad0cc010069aece85a8c638", "en"],
  ["6ad0cc010069aece85a8c639", "en"],
  ["6ad0cc440069aece85a8c654", "it"],
  ["6ad0cc440069aece85a8c658", "it"],
  ["6ad0ce6e0069aece85a8c6be", "it"],
  ["6ad0ce6e0069aece85a8c6c0", "en"],
  ["6ad0ce6e0069aece85a8c6c1", "nl"],
  ["6ad0ce6e0069aece85a8c6c2", "it"],
  ["6ad0cff40069aece85a8c6f8", "it"],
];
for (const [pid, lang] of targets) {
  const rec = byKey.get(`${pid}:${lang}`);
  if (!rec) {
    console.log("MISSING", pid.slice(-4), lang);
    continue;
  }
  const src = rec.source,
    tr = rec.translations;
  const errors = [];
  const pairs = [
    ["name", src.name, tr.name, "product_name"],
    ["desc", src.description, tr.description, "product_description"],
    [
      "tech",
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
  for (const [field, s, t2, type] of pairs) {
    if (typeof s !== "string" || !s.trim()) continue;
    const tk =
      field === "desc"
        ? null
        : validator.checkTechnicalTokens(s, String(t2 || ""));
    if (tk) errors.push(`${field}:${tk.error}`);
    const wl = validator.checkSourceLanguageLeak(
      s,
      String(t2 || ""),
      lang,
      type,
    );
    if (wl) errors.push(`${field}:mixed("${wl.phrase}")`);
    if (validator.checkMissingBrand) {
      const mb =
        field === "desc"
          ? validator.checkMissingBrand(s, String(t2 || ""))
          : null;
      if (mb) errors.push(`${field}:brand`);
    }
  }
  (src.descriptionImages || []).forEach((img, i) => {
    const alt = String(img.alt || "");
    if (!alt.trim()) return;
    const ta = (tr.descriptionImages || [])[i] || {};
    const tk = validator.checkTechnicalTokens(alt, String(ta.alt ?? ""));
    if (tk) errors.push(`alt.${i}:${tk.error}`);
    const wl = validator.checkSourceLanguageLeak(
      alt,
      String(ta.alt ?? ""),
      lang,
      "product_description_image_alt",
    );
    if (wl) errors.push(`alt.${i}:mixed("${wl.phrase}")`);
  });
  console.log(
    pid.slice(-4) + "/" + lang,
    errors.length ? errors.join(" | ") : "CLEAN",
  );
}
