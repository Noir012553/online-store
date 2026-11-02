// Fix pass 5: extend GLOBAL_TR with remaining VN words (trọng lượng, hợp kim
// nhôm, loại pin, kim loại, cầu vòng, cổng usb) — then rebuild tech again.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const SOURCES = fs.readFileSync(
  path.join(WS, "data", "sources-for-translation-next.txt"),
  "utf8",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const blocks = SOURCES.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));

const HEAD = {
  en: "Specifications",
  fr: "Spécifications",
  it: "Specifiche",
  nl: "Specificaties",
  sv: "Specifikationer",
  pt: "Especificações",
  es: "Especificaciones",
  de: "Technische Daten",
};

const GLOBAL_TR = [
  [
    /trọng lượng/gi,
    {
      en: "Weight",
      fr: "Poids",
      it: "Peso",
      nl: "Gewicht",
      sv: "Vikt",
      pt: "Peso",
      es: "Peso",
      de: "Gewicht",
    },
  ],
  [
    /hợp kim nhôm/gi,
    {
      en: "Aluminum alloy",
      fr: "Alliage d'aluminium",
      it: "Lega di alluminio",
      nl: "Aluminium legering",
      sv: "Aluminiumlegering",
      pt: "Liga de alumínio",
      es: "Aleación de aluminio",
      de: "Aluminiumlegierung",
    },
  ],
  [
    /loại pin/gi,
    {
      en: "Battery type",
      fr: "Type de pile",
      it: "Tipo di batteria",
      nl: "Batterijtype",
      sv: "Batterityp",
      pt: "Tipo de bateria",
      es: "Tipo de batería",
      de: "Batterietyp",
    },
  ],
  [
    /kim loại/gi,
    {
      en: "Metal",
      fr: "Métal",
      it: "Metallo",
      nl: "Metaal",
      sv: "Metall",
      pt: "Metal",
      es: "Metal",
      de: "Metall",
    },
  ],
  [
    /cầu vòng/gi,
    {
      en: "Arc curve",
      fr: "Courbe en arc",
      it: "Curva ad arco",
      nl: "Boog curve",
      sv: "Bågkurva",
      pt: "Curva em arco",
      es: "Curva en arco",
      de: "Bogenkurve",
    },
  ],
  [
    /cổng usb/gi,
    {
      en: "USB port",
      fr: "Port USB",
      it: "Porta USB",
      nl: "USB-poort",
      sv: "USB-port",
      pt: "Porta USB",
      es: "Puerto USB",
      de: "USB-Anschluss",
    },
  ],
];

function rebuildTech(lang, srcTech) {
  const pairs = [...srcTech.matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
  return (
    `${HEAD[lang]}: {` +
    pairs
      .map(([, k, v]) => {
        let kk = k,
          vv = v;
        for (const [re, words] of GLOBAL_TR) {
          if (words[lang]) {
            kk = kk.replace(re, words[lang]);
            vv = vv.replace(re, words[lang]);
          }
        }
        return `"${kk}": "${vv}"`;
      })
      .join(", ") +
    "}"
  );
}

let rebuilt = 0;
for (const rec of importData.records) {
  const pid = rec.productId,
    lang = rec.targetLang;
  const block = blockByPid.get(pid);
  if (!block) continue;
  const tm = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
  if (!tm) continue;
  const newTech = rebuildTech(lang, tm[1]);
  if (hand[pid] && hand[pid][lang])
    hand[pid][lang].technicalDescription = newTech;
  rec.translations.technicalDescription = newTech;
  rebuilt++;
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
fs.writeFileSync(IMPORT, JSON.stringify(importData, null, 2), "utf8");
console.log("tech rebuilt for", rebuilt, "records");

let leftovers = 0;
for (const rec of importData.records) {
  const t = rec.translations.technicalDescription || "";
  const wl = validator.checkSourceLanguageLeak(
    rec.source.technicalDescription,
    t,
    rec.targetLang,
    "product_technical_description",
  );
  if (wl) {
    leftovers++;
    console.log(
      rec.productId.slice(-4) + "/" + rec.targetLang,
      "leak:",
      wl.phrase,
    );
  }
}
console.log("remaining tech leaks:", leftovers);
