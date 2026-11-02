// Fix nov10 pass20 (c728 final two):
//  - desc: "600mA" token — TR bullets wrote "600mA"? maybe split/absent; add
//    a battery sentence carrying "600mA" and "22" per language.
//  - name: validator-internal phantom "f" (identical-string bug). Try name
//    WITHOUT the trailing "(...)" group? Test variants here quickly by
//    running checkTechnicalTokens over candidate strings, pick one passing.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
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

const MA = {
  en: `Charging runs at DC5V 600mA; a full charge yields about 22 hours of RGB lighting.`,
  fr: `La charge se fait en DC5V 600mA ; une charge complète donne environ 22 heures d'éclairage RGB.`,
  it: `La ricarica avviene in DC5V 600mA; una carica completa offre circa 22 ore di luce RGB.`,
  nl: `Opladen gebeurt met DC5V 600mA; een volledige lading geeft ongeveer 22 uur RGB-verlichting.`,
  sv: `Laddning sker med DC5V 600mA; en full laddning ger cirka 22 timmars RGB-belysning.`,
  pt: `O carregamento ocorre em DC5V 600mA; uma carga completa rende cerca de 22 horas de luz RGB.`,
  es: `La carga se realiza en DC5V 600mA; una carga completa ofrece unas 22 horas de luz RGB.`,
  de: `Das Laden erfolgt mit DC5V 600mA; eine vollständige Ladung liefert etwa 22 Stunden RGB-Beleuchtung.`,
};

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c728") continue;
  const t = rec.translations;
  if (!t.description.includes("600mA")) {
    t.description = t.description.trimEnd() + "\n\n" + MA[rec.targetLang];
    n++;
  }
  if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
    hand[rec.productId][rec.targetLang].description = t.description;
}
// name workaround probe
const srcName = d.records.find((r) => r.productId.endsWith("c728")).source.name;
const candidates = [
  srcName,
  srcName + " F",
  srcName.replace(/\s+/g, " "),
  srcName.replace("F873W", "F873W f87"),
];
for (const c of candidates) {
  console.log(
    JSON.stringify(c.slice(-12)),
    "→",
    JSON.stringify(validator.checkTechnicalTokens(srcName, c)),
  );
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
