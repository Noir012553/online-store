// Fix nov10 pass22: add 916g weight sentence (last token).
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

const W = {
  en: `Weight sits at about 916g without the cable or receiver (935g with them).`,
  fr: `Le poids est d'environ 916g sans câble ni récepteur (935g avec).`,
  it: `Il peso è di circa 916g senza cavo né ricevitore (935g con essi).`,
  nl: `Het gewicht ligt op ca. 916g zonder kabel of ontvanger (935g met).`,
  sv: `Vikten ligger på ca 916g utan kabel eller mottagare (935g med).`,
  pt: `O peso fica em cerca de 916g sem cabo nem recetor (935g com).`,
  es: `El peso ronda los 916g sin cable ni receptor (935g con ellos).`,
  de: `Das Gewicht liegt bei ca. 916g ohne Kabel oder Empfänger (935g mit).`,
};

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c728") continue;
  const t = rec.translations;
  if (!t.description.includes("916g")) {
    t.description = t.description.trimEnd() + "\n\n" + W[rec.targetLang];
    if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
      hand[rec.productId][rec.targetLang].description = t.description;
    n++;
  }
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
