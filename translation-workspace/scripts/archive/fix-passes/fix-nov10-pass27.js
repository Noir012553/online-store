// Fix nov10 pass27: token "1 mm" — dimensions bullet "41,10 +1 mm". Add a
// dimensions sentence with the "+1 mm" tolerance verbatim.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov10.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov10-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const DIM = {
  en: `Keyboard dimensions (L × W × H): 365.90 × 139.00 × 41.10 +1 mm.`,
  fr: `Dimensions du clavier (L × P × H) : 365.90 × 139.00 × 41.10 +1 mm.`,
  it: `Dimensioni della tastiera (L × P × H): 365.90 × 139.00 × 41.10 +1 mm.`,
  nl: `Toetsenbordafmetingen (L × B × H): 365.90 × 139.00 × 41.10 +1 mm.`,
  sv: `Tangentbordsmått (L × B × H): 365.90 × 139.00 × 41.10 +1 mm.`,
  pt: `Dimensões do teclado (C × L × A): 365.90 × 139.00 × 41.10 +1 mm.`,
  es: `Dimensiones del teclado (An × Pr × Al): 365.90 × 139.00 × 41.10 +1 mm.`,
  de: `Tastaturabmessungen (L × B × H): 365.90 × 139.00 × 41.10 +1 mm.`,
};

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c728") continue;
  const t = rec.translations;
  if (!t.description.includes("+1 mm")) {
    t.description = t.description.trimEnd() + "\n\n" + DIM[rec.targetLang];
    if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
      hand[rec.productId][rec.targetLang].description = t.description;
    n++;
  }
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
