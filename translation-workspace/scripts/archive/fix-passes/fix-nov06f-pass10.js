// Fix pass 10 — rewrite the 3 remaining tech leaks in full: c770/fr,
// c8a2/fr, c8a2/it. The leaks come from substrings "kích thước" and "kết nối"
// that survived in the tech JSON because the value-side translations missed
// them (my GLOBAL_TR was sorted but did not catch lowercase "kích thước" in
// "kích thước/Laytout" variant). This pass rewrites values directly.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const FIXED = {
  fr: {
    "kích thước": "taille",
    "kết nối": "connexion",
    "Không dây": "Sans fil",
    "Có dây": "Filaire",
  },
  it: {
    "kích thước": "dimensione",
    "kết nối": "connessione",
    "Không dây": "Wireless",
    "Có dây": "Cablato",
  },
};
for (const [tail, lang] of [
  ["c770", "fr"],
  ["c8a2", "fr"],
  ["c8a2", "it"],
]) {
  const rec = d.records.find(
    (r) => r.productId.endsWith(tail) && r.targetLang === lang,
  );
  let t = rec.translations.technicalDescription;
  for (const [vn, w] of Object.entries(FIXED[lang])) {
    t = t.replace(new RegExp(vn, "gi"), w);
  }
  rec.translations.technicalDescription = t;
  hand[rec.productId][lang].technicalDescription = t;
  console.log(tail + "/" + lang, "->", t);
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("fixed");
