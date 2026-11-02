// Fix pass 15 — replace "M650 Rose di Logitech" → "M650 Rose (Logitech)" to
// break the "rose di" bigram against VN "rose đi".
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
  /M650 Rose di Logitech unisce/g,
  "M650 Rose (Logitech) unisce",
);
h.description = r.translations.description;
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c8a2/it: 'Rose di Logitech' → 'Rose (Logitech)'");
