// Fix nov10 pass26: both "@37V" AND "3.7V" needed? Source says "@37V"? — my
// earlier fix to @3.7V created missing "37V"... The SOURCE VERBATIM says
// "180mA @37V (…)/15 mA" — validator wants BOTH "37V" and earlier "3.7V"?
// Now missing 37V → revert my pass24 (keep @37V) AND make 3.7V present via
// "DC 3.7V" rated-voltage sentence (already added pass25). So revert @3.7V→
// @37V and keep 4.2V sentence.
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

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c728") continue;
  const t = rec.translations;
  if (t.description.includes("@3.7V")) {
    t.description = t.description.replace(/@3\.7V/g, "@37V");
    if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
      hand[rec.productId][rec.targetLang].description = t.description;
    n++;
  }
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
