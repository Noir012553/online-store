// Fix nov10 pass19: c728 desc — the translated bullets dropped the "2.4G"
// token entirely (bullet map replace failed). Add a closing sentence carrying
// "2.4G" verbatim per language.
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

const SENT = {
  en: (n) =>
    `Connection covers three modes: wired Type-C, wireless 2.4G and Bluetooth.`,
  fr: (n) =>
    `La connexion couvre trois modes : Type-C filaire, 2.4G sans fil et Bluetooth.`,
  it: (n) =>
    `La connessione copre tre modalità: Type-C cablata, 2.4G wireless e Bluetooth.`,
  nl: (n) =>
    `De verbinding dekt drie modi: bedraad Type-C, draadloos 2.4G en Bluetooth.`,
  sv: (n) =>
    `Anslutningen täcker tre lägen: trådbunden Type-C, trådlös 2.4G och Bluetooth.`,
  pt: (n) =>
    `A ligação cobre três modos: Type-C com fios, 2.4G sem fios e Bluetooth.`,
  es: (n) =>
    `La conexión cubre tres modos: Type-C con cable, 2.4G inalámbrico y Bluetooth.`,
  de: (n) =>
    `Die Verbindung deckt drei Modi ab: kabelgebunden Type-C, kabellos 2.4G und Bluetooth.`,
};

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c728") continue;
  const t = rec.translations;
  if (!t.description.includes("2.4G")) {
    t.description =
      t.description.trimEnd() + "\n\n" + SENT[rec.targetLang](t.name);
    if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
      hand[rec.productId][rec.targetLang].description = t.description;
    n++;
  }
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
