// "để gaming" — the "để" is in the SOURCE name not the translation. The
// validator leaks if the bigram "để gaming" (normalized) appears in source
// name AND the SAME normalized bigram appears in translation. Our nl name
// probably has "Laptop Gaming" → normalized "laptop gaming"... no "de gaming".
// Check translation name + description case-insensitively.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const rec = importData.records.find(
  (r) => r.productId.endsWith("c6a3") && r.targetLang === "nl",
);
console.log("src name:", JSON.stringify(rec.source.name));
console.log("tr  name:", JSON.stringify(rec.translations.name));
// check both fields for the leak phrase
const fields = {
  name: rec.translations.name,
  desc: rec.translations.description,
};
for (const [k, v] of Object.entries(fields)) {
  const low = String(v).toLowerCase().replace(/\s+/g, " ");
  for (const needle of ["để gaming", "de gaming", "voor gaming"]) {
    const i = low.indexOf(needle);
    if (i >= 0)
      console.log(
        k,
        needle,
        JSON.stringify(String(v).slice(Math.max(0, i - 100), i + 100)),
      );
  }
}
