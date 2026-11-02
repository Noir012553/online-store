// Diagnose markup_mismatch for c6c8/c6ca/c645 using the backend validator.
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
const TAILS = ["c6c8", "c6ca", "c645"];
const out = [];
for (const r of d.records) {
  if (!TAILS.some((t) => r.productId.endsWith(t))) continue;
  const lang = r.targetLang;
  const cands = [];
  for (const f of ["description", "technicalDescription", "name"]) {
    if (!r.translations[f]) continue;
    // try simple markup diff heuristics
    const src = r.source[f] || "";
    const tr = r.translations[f];
    const srcLines = src.split(/\n/).filter((l) => l.trim());
    const trLines = tr.split(/\n/).filter((l) => l.trim());
    if (srcLines.length !== trLines.length)
      cands.push(`${f}: srcLines=${srcLines.length} trLines=${trLines.length}`);
    const srcBold = (src.match(/\*\*/g) || []).length;
    const trBold = (tr.match(/\*\*/g) || []).length;
    if (srcBold !== trBold) cands.push(`${f}: src**=${srcBold} tr**=${trBold}`);
    const srcBul = (src.match(/^[-•*]\s/gm) || []).length;
    const trBul = (tr.match(/^[-•*]\s/gm) || []).length;
    if (srcBul !== trBul) cands.push(`${f}: srcBul=${srcBul} trBul=${trBul}`);
  }
  out.push(
    `${r.productId.slice(-4)}/${lang}: ${cands.join(" | ") || "no obvious diff"}`,
  );
}
fs.writeFileSync(
  path.join(WS, "logs", "diag-nov09-markup.txt"),
  out.join("\n"),
  "utf8",
);
console.log(out.join("\n"));
