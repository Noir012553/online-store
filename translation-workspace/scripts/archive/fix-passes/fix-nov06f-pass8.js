// Fix pass 7b — the leak keywords come from lowercase vn SUBSTRINGS within
// Vietnamese labels in the SOURCE VALUE — e.g. "có dây USB 3.2 Gen 1" left as-is
// because the SOURCE VALUE contained the word. We must fully rewrite VALUES
// containing VN words into the target-language version.
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
  "assistant-batch-import-nov06f.json",
);
const SOURCES = path.join(WS, "data", "sources-for-translation-next.txt");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const SOURCES_TXT = fs.readFileSync(SOURCES, "utf8");
const blocks = SOURCES_TXT.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));

// Vietnamese→Target language word replacements (applied inside VALUES of
// technicalDescription, with source-verbatim sentence structures).
const VN_WORD_TR = {
  "cổng kết nối": {
    en: "ports",
    fr: "ports",
    it: "porte",
    nl: "poorten",
    sv: "portar",
    pt: "portas",
    es: "puertos",
    de: "anschlüsse",
  },
  "kết nối": {
    en: "connection",
    fr: "connexion",
    it: "connessione",
    nl: "verbinding",
    sv: "anslutning",
    pt: "ligação",
    es: "conexión",
    de: "verbindung",
  },
  "có dây": {
    en: "wired",
    fr: "filaire",
    it: "cablato",
    nl: "bedraad",
    sv: "trådbunden",
    pt: "com fios",
    es: "con cable",
    de: "kabelgebunden",
  },
  "không dây": {
    en: "wireless",
    fr: "sans fil",
    it: "wireless",
    nl: "draadloos",
    sv: "trådlös",
    pt: "sem fios",
    es: "inalámbrico",
    de: "kabellos",
  },
  "cầu vòng": {
    en: "rainbow",
    fr: "arc-en-ciel",
    it: "arcobaleno",
    nl: "regenboog",
    sv: "regnbåge",
    pt: "arco-íris",
    es: "arcoíris",
    de: "regenbogen",
  },
  "tương thích": {
    en: "compatible",
    fr: "compatible",
    it: "compatibile",
    nl: "compatibel",
    sv: "kompatibel",
    pt: "compatível",
    es: "compatible",
    de: "kompatibel",
  },
  "kim loại": {
    en: "metal",
    fr: "métal",
    it: "metallo",
    nl: "metaal",
    sv: "metall",
    pt: "metal",
    es: "metal",
    de: "metall",
  },
  "trọng lượng": {
    en: "weight",
    fr: "poids",
    it: "peso",
    nl: "gewicht",
    sv: "vikt",
    pt: "peso",
    es: "peso",
    de: "gewicht",
  },
  "hợp kim nhôm": {
    en: "aluminum alloy",
    fr: "alliège d'aluminium",
    it: "lega di alluminio",
    nl: "aluminiumlegering",
    sv: "aluminiumlegering",
    pt: "liga de alumínio",
    es: "aleación de aluminio",
    de: "aluminiumlegierung",
  },
  "loại pin": {
    en: "battery type",
    fr: "type de pile",
    it: "tipo di batteria",
    nl: "batterijtype",
    sv: "batterityp",
    pt: "tipo de bateria",
    es: "tipo de batería",
    de: "batterietyp",
  },
  "cổng usb": {
    en: "usb port",
    fr: "port usb",
    it: "porta usb",
    nl: "usb-poort",
    sv: "usb-port",
    pt: "porta usb",
    es: "puerto usb",
    de: "usb-anschluss",
  },
  cổng: {
    en: "port",
    fr: "port",
    it: "porta",
    nl: "poort",
    sv: "port",
    pt: "porta",
    es: "puerto",
    de: "anschluss",
  },
};

function translateVal(lang, value) {
  let vv = value;
  for (const [vn, words] of Object.entries(VN_WORD_TR)) {
    const re = new RegExp(vn, "gi");
    if (words[lang]) vv = vv.replace(re, words[lang]);
  }
  return vv;
}

function rebuildTech(lang, srcTech) {
  const pairs = [...srcTech.matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
  return (
    `${{ en: "Specifications", fr: "Spécifications", it: "Specifiche", nl: "Specificaties", sv: "Specifikationer", pt: "Especificações", es: "Especificaciones", de: "Technische Daten" }[lang]}: {` +
    pairs
      .map(([, k, v]) => {
        let kk = k,
          vv = v;
        for (const [vn, words] of Object.entries(VN_WORD_TR)) {
          const re = new RegExp(vn, "gi");
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
  rec.translations.technicalDescription = newTech;
  if (hand[pid] && hand[pid][lang])
    hand[pid][lang].technicalDescription = newTech;
  rebuilt++;
}
fs.writeFileSync(IMPORT, JSON.stringify(importData, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("rebuilt:", rebuilt);

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
    if (leftovers <= 8)
      console.log(
        rec.productId.slice(-4) + "/" + rec.targetLang,
        "leak:",
        wl.phrase,
      );
  }
}
console.log("remaining tech leaks:", leftovers);
