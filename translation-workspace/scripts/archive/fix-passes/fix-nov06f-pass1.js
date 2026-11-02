// Fix preflight leaks for nov06f:
//  1. c770/fr: tech JSON has VN "không dây" not translated — replace in tech
//     (wireless). Source: "Clavier mécanique sans fil DareU" - my tech
//     contains "Sans fil" already? leak found in desc... check desc.
//  2. c8a2/fr + it: "cảm biến" — sensor leak. Translate sensor word.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
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
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;
const SOURCES = fs.readFileSync(
  path.join(WS, "data", "sources-for-translation-next.txt"),
  "utf8",
);
const blocks = SOURCES.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));

// Helper: rebuild tech from source tech JSON using proper translations.
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
const KEY_TR = {
  "Phương thức kết nối": {
    en: "Connection",
    fr: "Connexion",
    it: "Connessione",
    nl: "Verbinding",
    sv: "Anslutning",
    pt: "Ligação",
    es: "Conexión",
    de: "Verbindung",
  },
  "Màu sắc": {
    en: "Color",
    fr: "Couleur",
    it: "Colore",
    nl: "Kleur",
    sv: "Färg",
    pt: "Cor",
    es: "Color",
    de: "Farbe",
  },
  "Cảm biến": {
    en: "Sensor",
    fr: "Capteur",
    it: "Sensore",
    nl: "Sensor",
    sv: "Sensor",
    pt: "Sensor",
    es: "Sensor",
    de: "Sensor",
  },
};
const VAL_TR = [
  [/(\d+)\s*phím/g, { fr: "$1 touches", it: "$1 tasti" }],
  [/Không dây/g, { fr: "Sans fil", it: "Wireless" }],
  [/Có dây/g, { fr: "Filaire", it: "Cablato" }],
  [/Không\b/g, { fr: "Non", it: "No" }],
  [/Nhựa/g, { fr: "Plastique", it: "Plastica" }],
  [/Trắng/g, { fr: "Blanc", it: "Bianco" }],
  [/Đen/g, { fr: "Noir", it: "Nero" }],
  [/Hồng/g, { fr: "Rose", it: "Rosa" }],
  [/Xám/g, { fr: "Gris", it: "Grigio" }],
  [/Xám Trắng/g, { fr: "Gris Blanc", it: "Grigio Bianco" }],
];
function rebuildTech(lang, srcTech) {
  const pairs = [...srcTech.matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
  return (
    `${HEAD[lang]}: {` +
    pairs
      .map(([, k, v]) => {
        const kk = KEY_TR[k] ? KEY_TR[k][lang] : k;
        let vv = String(v);
        for (const [re, words] of VAL_TR)
          if (words[lang]) vv = vv.replace(re, words[lang]);
        return `"${kk}": "${vv}"`;
      })
      .join(", ") +
    "}"
  );
}

// c770/fr
{
  const pid = idByTail["c770"];
  const block = blockByPid.get(pid);
  const srcTech = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/)[1];
  hand[pid].fr.technicalDescription = rebuildTech("fr", srcTech);
}
// c8a2/fr + it
for (const lang of ["fr", "it"]) {
  const pid = idByTail["c8a2"];
  const block = blockByPid.get(pid);
  const srcTech = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/)[1];
  hand[pid][lang].technicalDescription = rebuildTech(lang, srcTech);
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("tech rebuilt for c770/fr, c8a2/fr+it");

// Rebuild import file too
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
for (const rec of importData.records) {
  const h = hand[rec.productId] && hand[rec.productId][rec.targetLang];
  if (h) rec.translations = h;
}
fs.writeFileSync(IMPORT, JSON.stringify(importData, null, 2), "utf8");
console.log("import rebuilt");
