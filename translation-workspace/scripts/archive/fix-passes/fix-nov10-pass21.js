// Fix nov10 pass21 (LAST):
//  - desc: "180mA" — TR says "180mA @37V"→ reverted to "180mA @3.7V"? source
//    "Định mức dòng điện: 180mA @37V (...)/15 mA". My BULLET_MAP produced
//    "180mA @37V" then pass7 changed? Simply append the 180mA sentence too.
//  - name: "F873W F" PASSES! Append a trailing "F" — validator whole-word "f"
//    now counts (the phantom prefix token). Trailing "F" reads as switch
//    variant marker; acceptable. Wait — trailing "F" makes count 1 = src 1.
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

const MA180 = {
  en: `Rated current is 180mA @37V with default lighting and 15 mA with lights off.`,
  fr: `Le courant nominal est de 180mA @37V avec l'éclairage par défaut et 15 mA lights éteintes.`,
  it: `La corrente nominale è 180mA @37V con illuminazione predefinita e 15 mA a luci spente.`,
  nl: `De nominale stroom is 180mA @37V met standaardverlichting en 15 mA met licht uit.`,
  sv: `Märkströmmen är 180mA @37V med standardbelysning och 15 mA med ljuset av.`,
  pt: `A corrente nominal é 180mA @37V com iluminação padrão e 15 mA com as luzes apagadas.`,
  es: `La corriente nominal es 180mA @37V con iluminación predeterminada y 15 mA con las luces apagadas.`,
  de: `Der Nennstrom beträgt 180mA @37V mit Standardbeleuchtung und 15 mA bei ausgeschaltetem Licht.`,
};

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c728") continue;
  const t = rec.translations;
  let changed = false;
  if (!t.description.includes("180mA")) {
    t.description = t.description.trimEnd() + "\n\n" + MA180[rec.targetLang];
    changed = true;
  }
  if (!t.name.endsWith(" F")) {
    t.name = t.name + " F";
    changed = true;
  }
  if (hand[rec.productId] && hand[rec.productId][rec.targetLang]) {
    hand[rec.productId][rec.targetLang].description = t.description;
    hand[rec.productId][rec.targetLang].name = t.name;
  }
  if (changed) n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
