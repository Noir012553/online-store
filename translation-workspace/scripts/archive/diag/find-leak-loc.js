// Locate exact field containing remaining leaks
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov08.json"),
    "utf8",
  ),
);
const targets = [
  ["c69b", "nl", "để cpu"],
  ["c6a5", "fr", "rtx đủ"],
  ["c7e3", "it", "switch sử"],
  ["c7ed", "fr", "là ram"],
  ["c7ed", "es", "là ram"],
];
let found = 0;
for (const [tail, lang, phrase] of targets) {
  const rec = d.records.find(
    (r) => r.productId.endsWith(tail) && r.targetLang === lang,
  );
  const hay = {
    name: rec.translations.name,
    description: rec.translations.description,
    technicalDescription: rec.translations.technicalDescription,
    specs: JSON.stringify(rec.translations.specs || {}),
    alts: JSON.stringify(rec.translations.descriptionImages || []),
  };
  for (const [f, txt] of Object.entries(hay)) {
    const norm = txt.normalize("NFD");
    let i = norm.indexOf(phrase);
    if (i < 0) i = norm.indexOf(phrase.replace(/đ/gi, "d"));
    if (i < 0) i = norm.toLowerCase().indexOf(phrase.toLowerCase());
    if (i >= 0) {
      found++;
      console.log(
        `${tail}/${lang} phrase in ${f} at ${i}: ...${JSON.stringify(txt.slice(Math.max(0, i - 60), i + 80))}...`,
      );
    }
  }
}
console.log(`found: ${found} phrase matches`);
