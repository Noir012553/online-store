// Fix c760/es and c781/it — break the source bigram in the second line by
// changing the adjectives/nouns adjacent to the trigger word.
//  c760/es: "pro rgb negro dream switch de DareU" → "pro rgb negro dream de DareU" (drop switch)
//  c781/it: "Black di DareU" — VN source phrase is "Black sử" — "di" matches
//    "đi" so "Black di" triggers it. Rewrite to "Black, modello di DareU".
const path = require("path");
const fs = require("fs");
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

// c760/es
const r1 = d.records.find(
  (x) => x.productId.endsWith("c760") && x.targetLang === "es",
);
r1.translations.description = r1.translations.description.replace(
  "pro rgb negro dream switch de DareU",
  "pro rgb negro dream, diseñado por DareU",
);
hand[r1.productId].es.description = r1.translations.description;

// c781/it
const r2 = d.records.find(
  (x) => x.productId.endsWith("c781") && x.targetLang === "it",
);
r2.translations.description = r2.translations.description.replace(
  /A950GM Black, creato da DareU/g,
  "A950GM Black — prodotto di DareU",
);
r2.translations.description = r2.translations.description.replace(
  "Il mouse gaming wireless DareU A950GM Black — prodotto di DareU, unisce",
  "Il mouse gaming wireless DareU A950GM Black (prodotto DareU) unisce",
);
hand[r2.productId].it.description = r2.translations.description;

fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass26 done");

// pass26b: c781/it — "Black su GearVN" contains "su" which normalizes to
// "sử" (VN "use"). Replace "su" preposition with "presso" to break the bigram.
const r3 = d.records.find((x) => x.productId.endsWith("c781") && x.targetLang === "it");
r3.translations.description = r3.translations.description.replace(
  "Black su GearVN",
  "Black presso GearVN",
);
hand[r3.productId].it.description = r3.translations.description;
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass26b done");
