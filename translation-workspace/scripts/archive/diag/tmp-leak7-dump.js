// Dump translations for the 7 leak records
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06f.json"),
    "utf8",
  ),
);
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
  const r = d.records.find(
    (x) => x.productId.endsWith(tail) && x.targetLang === lang,
  );
  if (!r) continue;
  out.push(`=== ${tail}/${lang}`);
  out.push(`NAME: ${r.translations.name}`);
  out.push(`DESC: ${r.translations.description.slice(0, 500)}`);
  out.push("");
}
fs.writeFileSync(path.join(WS, "logs", "leak7-tr.txt"), out.join("\n"), "utf8");
console.log("done");
