// Diagnose the "rose đi" phrase location — the description was rewritten but
// the phrase still exists somewhere (maybe the name or imageAlts).
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const rec = d.records.find(
  (r) => r.productId.endsWith("c8a2") && r.targetLang === "it",
);
for (const [field, v] of Object.entries(rec.translations)) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  const i = s.toLowerCase().indexOf("rose đi");
  if (i >= 0)
    console.log(
      "FIELD",
      field,
      JSON.stringify(s.slice(Math.max(0, i - 120), i + 80)),
    );
}
