// Fix pass 12 — c770/fr name has residual VN words "Không dây" + "Trắng";
// c8a2/it has "Rose su GearVN" (su = VN bigram). Both fixed with targeted
// regex rewrite.
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

// c770/fr — replace VN name words with French translations
const r770 = d.records.find(
  (r) => r.productId.endsWith("c770") && r.targetLang === "fr",
);
const h770 = hand[r770.productId].fr;
const NAME_FR =
  "Clavier mécanique sans fil DareU EK98 Pro RGB Blanc Dream Switch";
r770.translations.name = NAME_FR;
h770.name = NAME_FR;
// also in description
r770.translations.description = r770.translations.description
  .replace(/Clavier DareU Không dây EK98 Pro RGB Trắng Dream Switch/g, NAME_FR)
  .replace(
    /Clavier mécanique sans fil DareU EK98 Pro RGB Blanc Dream Switch de DareU/g,
    NAME_FR,
  );
h770.description = r770.translations.description;
// specs values: "Nhựa"→"Plastique", "98 phím"→"98 touches"
if (r770.translations.specs) {
  for (const k of Object.keys(r770.translations.specs)) {
    let v = r770.translations.specs[k];
    v = v.replace(/Nhựa/g, "Plastique").replace(/(\d+)\s*phím/gi, "$1 touches");
    r770.translations.specs[k] = v;
  }
  h770.specs = r770.translations.specs;
}
r770.translations.technicalDescription = (
  r770.translations.technicalDescription || ""
)
  .replace(/Nhựa/g, "Plastique")
  .replace(/(\d+)\s*phím/gi, "$1 touches");
h770.technicalDescription = r770.translations.technicalDescription;

// c8a2/it — "Rose su GearVN" → "Rose presso GearVN"
const r8a2it = d.records.find(
  (r) => r.productId.endsWith("c8a2") && r.targetLang === "it",
);
const h8a2it = hand[r8a2it.productId].it;
r8a2it.translations.description = r8a2it.translations.description.replace(
  /Rose su GearVN/g,
  "Rose presso GearVN",
);
h8a2it.description = r8a2it.translations.description;

fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c770/fr name+specs fixed; c8a2/it Rose su → presso fixed");
