// Fix the 7 remaining mixed_language leaks — validator matched VN phrase that
// appears in SOURCE DESCRIPTION but not in translation; but translation
// contains the same phrase in a DIFFERENT form (e.g. "Piano Pro switch" —
// actually the issue is likely in other fields: specs values with VN words).
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const d = JSON.parse(
  fs.readFileSync(path.join(WS, "data", "import", "assistant-batch-import-nov06f.json"), "utf8"),
);
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(path.join(BACKEND, "src", "utils", "translationValidator.js"));
const targets = [
  ["c907", "it"],
  ["c637", "es"],
  ["c63e", "fr"],
  ["c63e", "nl"],
  ["c760", "es"],
  ["c781", "it"],
  ["c7aa", "es"],
];
const out = [];
for (const [tail, lang] of targets) {
  const r = d.records.find((x) => x.productId.endsWith(tail) && x.targetLang === lang);
  if (!r) continue;
  const pairs = [
    ["name", r.source.name, r.translations.name],
    ["description", r.source.description, r.translations.description],
    ["tech", r.source.technicalDescription, r.translations.technicalDescription],
    ...Object.entries(r.source.specs || {}).map(([k, v]) => [`spec.${k}`, v, (r.translations.specs || {})[k]]),
  ];
  out.push(`=== ${tail}/${lang}`);
  for (const [field, src, tr] of pairs) {
    const v = validator.checkSourceLanguageLeak(String(src), String(tr || ""), lang, "product_description");
    if (v) {
      out.push(`${field}: phrase="${v.phrase}"`);
      // find it in translation
      const i = String(tr || "").toLowerCase().indexOf(v.phrase.toLowerCase());
      out.push(`   tr ctx: ${JSON.stringify(String(tr || "").slice(Math.max(0, i - 100), i + 100))}`);
      out.push(`   src ctx: ${JSON.stringify(String(src).slice(String(src).toLowerCase().indexOf(v.phrase.toLowerCase()) - 80, String(src).toLowerCase().indexOf(v.phrase.toLowerCase()) + 80))}`);
    }
  }
}
fs.writeFileSync(path.join(WS, "logs", "leak7-detail.txt"), out.join("\n") + "\n", "utf8");
console.log("done");
