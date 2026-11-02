// Fix "Việt Nam" in names/descriptions across all nov09 records.
// Source AKKO model name "Red World Tour Việt Nam" → target-language form:
// en/es/it/de/nl/fr/sv: "Vietnam", pt: "Vietnã". Keeps the word recognizable
// as the model variant while removing the flagged Vietnamese phrase.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));

let fixed = 0;
const perLang = {};
for (const rec of d.records) {
  const lang = rec.targetLang;
  const word = lang === "pt" ? "Vietnã" : "Vietnam";
  const apply = (t) =>
    t
      .replace(/Việt Nam/g, word)
      .replace(/VIET NAM/g, word.toUpperCase())
      .replace(/Viet Nam/gi, word);
  const t = rec.translations;
  let changed = false;
  for (const f of ["name", "description", "technicalDescription"]) {
    if (t[f] && /viet nam/i.test(t[f].normalize("NFC"))) {
      t[f] = apply(t[f].normalize("NFC"));
      changed = true;
    }
  }
  for (const k of Object.keys(t.specs || {})) {
    if (/viet nam/i.test(t.specs[k])) {
      t.specs[k] = apply(t.specs[k].normalize("NFC"));
      changed = true;
    }
  }
  if (t.descriptionImages) {
    for (const img of t.descriptionImages) {
      if (img && img.alt && /viet nam/i.test(img.alt)) {
        img.alt = apply(img.alt.normalize("NFC"));
        changed = true;
      }
    }
  }
  if (changed) {
    fixed++;
    perLang[lang] = (perLang[lang] || 0) + 1;
  }
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
console.log("fixed records:", fixed, JSON.stringify(perLang));
