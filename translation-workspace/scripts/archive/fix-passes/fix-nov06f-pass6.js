// Fix pass 6 — force-translate specific values by simple map per language,
// independent of source words: if key contains the VN word OR value contains
// it, replace them directly.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
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

const FINAL_VAL = [
  [
    /có dây/gi,
    {
      en: "Wired",
      fr: "Filaire",
      it: "Cablato",
      nl: "Bedraad",
      sv: "Trådbunden",
      pt: "Com fios",
      es: "Con cable",
      de: "Kabelgebunden",
    },
  ],
  [
    /không dây/gi,
    {
      en: "Wireless",
      fr: "Sans fil",
      it: "Wireless",
      nl: "Draadloos",
      sv: "Trådlös",
      pt: "Sem fios",
      es: "Inalámbrico",
      de: "Kabellos",
    },
  ],
  [
    /cầu vòng/gi,
    {
      en: "Arc curve",
      fr: "Arc en ciel",
      it: "Arcobaleno",
      nl: "Regenboog",
      sv: "Regnbåge",
      pt: "Arco-íris",
      es: "Arcoíris",
      de: "Regenbogen",
    },
  ],
  [
    /kết nối/gi,
    {
      en: "Connection",
      fr: "Connexion",
      it: "Connessione",
      nl: "Verbinding",
      sv: "Anslutning",
      pt: "Ligação",
      es: "Conexión",
      de: "Verbindung",
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

function mapTech(lang, srcTech) {
  const pairs = [...srcTech.matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
  const keyMap = {
    "Phương thức kết nối": "Connection",
    "Màu sắc": "Color",
    "Cảm biến": "Sensor",
    "Đèn LED": "LED",
    "Số lượng phím": "Number of keys",
  };
  return (
    `${HEAD[lang]}: {` +
    pairs
      .map(([, k, v]) => {
        const kk = keyMap[k] || k;
        let vv = String(v);
        for (const [re, words] of FINAL_VAL)
          if (words[lang]) vv = vv.replace(re, words[lang]);
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
  const newTech = mapTech(lang, tm[1]);
  rec.translations.technicalDescription = newTech;
  if (hand[pid] && hand[pid][lang])
    hand[pid][lang].technicalDescription = newTech;
  rebuilt++;
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
fs.writeFileSync(IMPORT, JSON.stringify(importData, null, 2), "utf8");
console.log("final tech rebuilt:", rebuilt);

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
