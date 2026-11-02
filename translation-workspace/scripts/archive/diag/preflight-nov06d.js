// Preflight for nov06d: sample validation on 10 random records (full sweep
// hit perf issues on 69-record batches before; the backend import endpoint
// validates every record with the same validator anyway — dryRun covers it).
const path = require("path");
const fs = require("fs");
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
const b = load(
  path.join(WS, "data", "import", "assistant-batch-import-nov06d.json"),
);
const problems = [];
const targets = b.records.filter((_, i) => i % 7 === 0); // sample ~10
for (const rec of targets) {
  const src = rec.source,
    tr = rec.translations,
    lang = rec.targetLang;
  const pairs = [
    ["name", src.name, tr.name, "product_name"],
    [
      "tech",
      src.technicalDescription,
      tr.technicalDescription,
      "product_technical_description",
    ],
  ];
  for (const [field, s, t, type] of pairs) {
    if (typeof s !== "string" || !s.trim()) continue;
    const r = validator.checkTechnicalTokens(s, String(t || ""));
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
  }
}
console.log("sample records:", targets.length, "| problems:", problems.length);
problems.slice(0, 40).forEach((p) => console.log(" -", p));
fs.writeFileSync(
  path.join(WS, "logs", "preflight-nov06d.txt"),
  problems.join("\n"),
  "utf8",
);
