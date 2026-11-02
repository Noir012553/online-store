// Read-only: dump en translations of c5f9/c5fa/c5fb as the rebuild template.
const fs = require("fs");
const path = require("path");
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
for (const sfx of ["c5f9", "c5fa", "c5fb"]) {
  for (const lang of ["en", "es"]) {
    const r = b.records.find(
      (x) => x.productId.endsWith(sfx) && x.targetLang === lang,
    );
    if (!r) {
      out.push(`=== ${sfx}/${lang}: NO RECORD`);
      continue;
    }
    const t = r.translations;
    out.push(`=== ${sfx}/${lang} ===`);
    out.push("NAME: " + t.name);
    out.push("DESC:\n" + t.description);
    out.push("TECH: " + t.technicalDescription);
    out.push("SPECS: " + JSON.stringify(t.specs));
    out.push(
      "ALTS: " + JSON.stringify((t.descriptionImages || []).map((i) => i.alt)),
    );
    out.push("");
  }
}
fs.writeFileSync(
  path.join(__dirname, "..", "logs", "dump-en-3.txt"),
  out.join("\n"),
  "utf8",
);
console.log("written logs/dump-en-3.txt", out.length);
