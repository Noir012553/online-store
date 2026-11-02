// Search import JSON for the literal "switch dễ" phrase (case-folded,
// whitespace-tolerant) to locate the c770/fr record exactly.
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
for (const r of d.records) {
  const blob = JSON.stringify(r.translations)
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (
    blob.includes("switch d\\u1ec5") ||
    blob.includes("switch dễ") ||
    blob.includes("d\\u1ec5")
  ) {
    console.log(r.productId.slice(-4) + "/" + r.targetLang);
    const m = blob.match(/.{0,80}d\\u1ec5.{0,80}|.{0,80}dễ.{0,80}/g);
    if (m) console.log(JSON.stringify(m));
  }
}
