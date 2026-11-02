// Fix nov10 pass23: add 4.0mm key-travel sentence (last token).
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

const T = {
  en: `Key travel is 4.0mm with a linear typing sound profile.`,
  fr: `La course des touches est de 4.0mm avec un profil sonore linéaire.`,
  it: `La corsa dei tasti è di 4.0mm con un profilo sonoro lineare.`,
  nl: `De toetsenslag is 4.0mm met een lineair typgeluid.`,
  sv: `Tangentresan är 4.0mm med ett linjärt skrivljud.`,
  pt: `O curso das teclas é de 4.0mm com um perfil sonoro linear.`,
  es: `El recorrido de tecla es de 4.0mm con un perfil sonoro lineal.`,
  de: `Der Tastenweg beträgt 4.0mm mit linearem Schallprofil.`,
};

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c728") continue;
  const t = rec.translations;
  if (!t.description.includes("4.0mm")) {
    t.description = t.description.trimEnd() + "\n\n" + T[rec.targetLang];
    if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
      hand[rec.productId][rec.targetLang].description = t.description;
    n++;
  }
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
