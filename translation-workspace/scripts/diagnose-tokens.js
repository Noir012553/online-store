const path = require("path");
const backend = "E:/dev-camp/24-9-26 copy 98/online-store-backend";
const validator = require(
  path.join(backend, "src/utils/translationValidator.js"),
);
const fs = require("fs");
function loadClean(p) {
  let s = fs.readFileSync(p, "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return JSON.parse(s);
}
const exp = loadClean("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/export/assistant-batch-10-products-8lang.json");
const imp = loadClean("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-import-10-products.json");
const srcMap = new Map(
  exp.records.map((r) => [r.productId + ":" + r.targetLang, r.source]),
);

const cases = [
  ["6ad0d7c80069aece85a8c917", "nl", "description"],
  ["6ad0d7c80069aece85a8c918", "en", "description"],
  ["6ad0d7c80069aece85a8c918", "de", "description"],
  ["6ad0d7c80069aece85a8c918", "it", "description"],
  ["6ad0d7c80069aece85a8c918", "it", "technicalDescription"],
  ["6ad0d7c80069aece85a8c918", "es", "technicalDescription"],
  ["6ad0d7c80069aece85a8c918", "nl", "description"],
  ["6ad0d7c80069aece85a8c918", "sv", "description"],
  ["6ad0d7c80069aece85a8c919", "de", "description"],
  ["6ad0d7c80069aece85a8c91a", "de", "description"],
  ["6ad0d7c80069aece85a8c91f", "nl", "description"],
  ["6ad0d7c80069aece85a8c91f", "sv", "description"],
  ["6ad0d7c80069aece85a8c920", "nl", "description"],
  ["6ad0d7c80069aece85a8c920", "sv", "description"],
];
for (const [pid, lang, field] of cases) {
  const src = srcMap.get(pid + ":" + lang);
  const rec = imp.records.find(
    (r) => r.productId === pid && r.targetLang === lang,
  );
  const o = String(src[field] || ""),
    t = String(rec.translations[field] || "");
  const so = validator.getTechnicalTokens
    ? validator.getTechnicalTokens(o)
    : null;
  // validator instance may not expose helpers; re-derive via check error tokens only
  const r = validator.checkTechnicalTokens(o, t);
  console.log(
    "=====",
    pid.slice(-3),
    lang,
    field,
    "=>",
    r ? JSON.stringify(r.error) + " token=" + JSON.stringify(r.token) : "PASS",
  );
  if (r) {
    // find context of the token in the appropriate text
    const tok = String(r.token);
    const inSrc = o.includes(tok);
    const inTr = t.includes(tok);
    console.log("  token in source:", inSrc, "| in translation:", inTr);
    if (inSrc) {
      const i = o.indexOf(tok);
      console.log(
        "  src ctx:",
        JSON.stringify(o.slice(Math.max(0, i - 50), i + 60)),
      );
    }
    if (inTr) {
      const i = t.indexOf(tok);
      console.log(
        "  trn ctx:",
        JSON.stringify(t.slice(Math.max(0, i - 50), i + 60)),
      );
    } else {
      // try to find similar in translation
      const core = tok.replace(/[^\p{L}\d]/gu, "").slice(0, 4);
      const m = t.match(new RegExp(".{0,40}" + core + ".{0,40}"));
      if (m) console.log("  similar in trn:", JSON.stringify(m[0]));
    }
  }
}
