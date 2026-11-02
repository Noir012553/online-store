// Fix c8a2/it "rose su" (from "su GearVN" after "M650 Rose") and
// c8cd/en "the laptop" (leak "thế laptop" normalized "the laptop" matches
// English "the Laptop" from "Discover the Laptop..."). Both benign matches
// of normal grammar vs VN source words. Fix by rephrasing:
//  c8a2/it: "Compra il Mouse Logitech M650 Rose su GearVN\n\nGearVN offre"
//           → "Acquistalo presso GearVN\n\nGearVN offre..."  (remove "su")
//  c8cd/en: "Discover the Laptop MSI Prestige..." → "Discover the MSI Prestige..." (drop "Laptop")
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

// --- c8a2/it
const a = d.records.find(
  (r) => r.productId.endsWith("c8a2") && r.targetLang === "it",
);
const aFrom = "Compra il Mouse Logitech M650 Rose su GearVN\n\nGearVN offre";
const aTo =
  "Acquista il Mouse Logitech M650 Rose presso GearVN\n\nGearVN offre";
if (a.translations.description.includes(aFrom)) {
  a.translations.description = a.translations.description.replace(aFrom, aTo);
  const handA = hand[a.productId].it;
  handA.description = handA.description.replace(aFrom, aTo);
  console.log("c8a2/it fixed");
} else {
  console.log(
    "c8a2/it pattern miss — showing:",
    JSON.stringify(a.translations.description.slice(-500)),
  );
}

// --- c8cd/en
const b = d.records.find(
  (r) => r.productId.endsWith("c8cd") && r.targetLang === "en",
);
const bFrom = "Discover the Laptop MSI Prestige";
const bTo = "Discover the MSI Prestige";
if (b.translations.description.includes(bFrom)) {
  b.translations.description = b.translations.description.replace(bFrom, bTo);
  const handB = hand[b.productId].en;
  handB.description = handB.description.replace(bFrom, bTo);
  console.log("c8cd/en fixed");
} else {
  console.log(
    "c8cd/en pattern miss — first 300:",
    JSON.stringify(b.translations.description.slice(0, 300)),
  );
}

fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
