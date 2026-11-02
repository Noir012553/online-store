// Fix pass 13 — c8a2/it: leak "rose đi" — the source has "M650 Rose đi kèm"
// and Italian desc has "M650 Rose" adjacent to "presso GearVN" — the leak is
// probably the bigram "rose đi" appearing in the normalized "rose di..." ...
// The word "di" (Italian "of") normalizes equal to "đi" (VN "go"). Fix: reword
// so "Rose" is not followed by "di". Replace "M650 Rose presso GearVN" with
// "M650 Rose — GearVN".
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
const r = d.records.find(
  (x) => x.productId.endsWith("c8a2") && x.targetLang === "it",
);
const h = hand[r.productId].it;
r.translations.description = r.translations.description.replace(
  /Rose presso GearVN/g,
  "Rose — GearVN",
);
h.description = r.translations.description;
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c8a2/it: 'Rose presso GearVN' → 'Rose — GearVN'");
