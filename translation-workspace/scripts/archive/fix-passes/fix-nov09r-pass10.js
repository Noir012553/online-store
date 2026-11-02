// Fix pass 10: c891 de/sv — "X2-Linie"/"X2-linjen" create unexpected tokens.
// Replace those phrases with wording that avoids the hyphenated token.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov09-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const SUB = {
  de: [
    [/gegenüber der früheren X2-Linie/gi, "gegenüber der früheren Reihe X2"],
    [/Ein Blick auf die X2-Reihe zeigt/gi, "Ein Blick auf die Reihe X2 zeigt"],
  ],
  sv: [
    [
      /jämfört med den tidigare X2-linjen/gi,
      "jämfört med den tidigare linjen X2",
    ],
    [
      /jämfört med den tidigare X2-serien/gi,
      "jämfört med den tidigare serien X2",
    ],
    [/En titt på X2-serien visar/gi, "En titt på serien X2 visar"],
  ],
};

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c891") continue;
  const lang = rec.targetLang;
  if (!SUB[lang]) continue;
  const t = rec.translations;
  let desc = String(t.description || "");
  for (const [re, w] of SUB[lang]) desc = desc.replace(re, w);
  t.description = desc;
  if (hand[rec.productId] && hand[rec.productId][lang])
    hand[rec.productId][lang].description = desc;
  n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
