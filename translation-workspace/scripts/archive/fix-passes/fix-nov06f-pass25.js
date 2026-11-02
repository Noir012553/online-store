// Fix c760/it "Switch" — lowercase the trailing "Switch" in the name to break
// bigram with the source "Switch dễ dàng" heading.
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
const r = d.records.find(
  (x) => x.productId.endsWith("c760") && x.targetLang === "it",
);
const t = r.translations.description;
r.translations.description = t.replace(
  "pro rgb nero dream Switch",
  "pro rgb nero dream switch",
);
hand[r.productId].it.description = r.translations.description;
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c760/it Switch→switch done");
