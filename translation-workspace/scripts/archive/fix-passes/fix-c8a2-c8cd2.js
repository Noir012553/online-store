// Fix pass: regex-based rewrite accounting for double spaces in names.
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

const a = d.records.find(
  (r) => r.productId.endsWith("c8a2") && r.targetLang === "it",
);
a.translations.description = a.translations.description
  .replace(
    /Compra il Mouse\s+Logitech M650 Rose su GearVN/g,
    "Acquista il Mouse Logitech M650 Rose presso GearVN",
  )
  .replace(
    /Ordina subito il Mouse\s+Logitech M650 Rose/g,
    "Ordina subito il Mouse Logitech M650 Rose",
  );
hand[a.productId].it.description = a.translations.description;

const b = d.records.find(
  (r) => r.productId.endsWith("c8cd") && r.targetLang === "en",
);
b.translations.description = b.translations.description
  .replace(/Discover the Laptop\s+MSI Prestige/g, "Discover the MSI Prestige")
  .replace(/The Laptop\s+MSI Prestige/g, "The MSI Prestige");
b.translations.name = b.translations.name.replace(
  /Laptop\s+MSI Prestige/g,
  "MSI Prestige",
);
hand[b.productId].en.description = b.translations.description;
hand[b.productId].en.name = b.translations.name;

fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("regex fixes done");
