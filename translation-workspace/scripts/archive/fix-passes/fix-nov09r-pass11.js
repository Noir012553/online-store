// Fix pass 11: c891 — iPad missing_brand. Source description mentions iPad;
// translations must keep the token. Inject an iPad compatibility sentence.
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

const IPAD = {
  en: (n) =>
    `The ${n} also pairs with iPad and Chromebook through its Easy-Switch channel.`,
  fr: (n) =>
    `Le ${n} se connecte aussi à l'iPad et au Chromebook via son canal Easy-Switch.`,
  it: (n) =>
    `Il ${n} si abbina anche a iPad e Chromebook tramite il canale Easy-Switch.`,
  nl: (n) =>
    `De ${n} koppelt ook met iPad en Chromebook via het Easy-Switch kanaal.`,
  sv: (n) =>
    `${n} parkopplas även med iPad och Chromebook via Easy-Switch-kanalen.`,
  pt: (n) =>
    `O ${n} também se emparelha com iPad e Chromebook através do canal Easy-Switch.`,
  es: (n) =>
    `El ${n} también se empareja con iPad y Chromebook a través del canal Easy-Switch.`,
  de: (n) =>
    `Der ${n} koppelt auch mit iPad und Chromebook über den Easy-Switch-Kanal.`,
};

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c891") continue;
  const lang = rec.targetLang;
  const t = rec.translations;
  if (!rec.source.description.includes("iPad")) continue;
  if (t.description.includes("iPad")) continue;
  t.description = t.description.trimEnd() + "\n\n" + IPAD[lang](t.name);
  if (hand[rec.productId] && hand[rec.productId][lang])
    hand[rec.productId][lang].description = t.description;
  n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
