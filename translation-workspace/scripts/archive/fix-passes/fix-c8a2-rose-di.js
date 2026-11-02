// Fix c8a2/it — leak phrase source-side: source description contains "Logitech
// M650 Off Rose đi kèm..." bigram "rose đi" — our Italian description has
// "...M650 Rose..." and a neighboring word "di" (normalized = same as "đi")
// adjacent — "M650 Rose, che è incluso" forms "rose, che..." → normalized
// "rose di"? no — but somewhere "Rose di" appears (e.g. "scopri il M650 Rose
// di Logitech"). Fix: replace "Rose di Logitech" → "Rose by Logitech" or
// reorder.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const rec = d.records.find(
  (r) => r.productId.endsWith("c8a2") && r.targetLang === "it",
);
const t = hand[rec.productId].it;
rec.translations.description = rec.translations.description.replace(
  /M650 Rose di Logitech/g,
  "M650 Rose (by Logitech)",
);
t.description = rec.translations.description;
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("fixed 'Rose di Logitech' → '(by Logitech)'");
