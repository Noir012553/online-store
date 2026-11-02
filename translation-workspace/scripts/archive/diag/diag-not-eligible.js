// Diagnose not_eligible slots: run the backend validator on every field.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov09.json"),
    "utf8",
  ),
);
const TAILS = (process.env.TAILS || "c7ca,c891").split(",");
const out = [];
for (const rec of d.records) {
  if (!TAILS.includes(rec.productId.slice(-4))) continue;
  const { source: src, translations: trs, targetLang: lang } = rec;
  const errs = [];
  const fields = ["name", "description", "technicalDescription"];
  for (const f of fields) {
    const s = src[f] || "",
      t = trs[f] || "";
    const tt = validator.checkTechnicalTokens(s, t);
    if (tt) errs.push(`${f}/tech:${tt.error}:${tt.token}`);
    const mk = validator.checkMarkup(s, t);
    if (mk) errs.push(`${f}/markup:${JSON.stringify(mk).slice(0, 80)}`);
    const lk = validator.checkSourceLanguageLeak(s, t, lang, `f_${f}`);
    if (lk) errs.push(`${f}/leak:${lk.phrase}`);
  }
  for (const k of Object.keys(src.specs || {})) {
    const tt = validator.checkTechnicalTokens(
      String(src.specs[k]),
      String(trs.specs?.[k] ?? ""),
    );
    if (tt) errs.push(`specs.${k}/tech:${tt.error}:${tt.token}`);
  }
  out.push(
    `${rec.productId.slice(-4)}/${lang}: ${errs.join(" | ") || "clean"}`,
  );
}
fs.writeFileSync(
  path.join(WS, "logs", "diag-not-eligible.txt"),
  out.join("\n"),
  "utf8",
);
console.log(out.join("\n"));
