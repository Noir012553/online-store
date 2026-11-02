// Fix nov10 pass25: 4.2V — add rated-voltage sentence (full 4.2V).
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

const V = {
  en: `Rated voltage is DC 3.7V (up to a full 4.2V when charged).`,
  fr: `La tension nominale est DC 3.7V (jusqu'à 4.2V une fois chargée).`,
  it: `La tensione nominale è DC 3.7V (fino a 4.2V a carica completa).`,
  nl: `De nominale spanning is DC 3.7V (tot een volle 4.2V bij opladen).`,
  sv: `Märkspänningen är DC 3.7V (upp till 4.2V vid full laddning).`,
  pt: `A tensão nominal é DC 3.7V (até 4.2V com carga completa).`,
  es: `El voltaje nominal es DC 3.7V (hasta 4.2V con carga completa).`,
  de: `Die Nennspannung beträgt DC 3.7V (bis zu vollen 4.2V bei Ladung).`,
};

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c728") continue;
  const t = rec.translations;
  if (!t.description.includes("4.2V")) {
    t.description = t.description.trimEnd() + "\n\n" + V[rec.targetLang];
    if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
      hand[rec.productId][rec.targetLang].description = t.description;
    n++;
  }
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
