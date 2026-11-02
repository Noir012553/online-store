// Fix pass 6: fill missing specs keys (source spec keys like connection/
// sensor/led kept verbatim value translation) + missing alts.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const save = (p, d) =>
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n", "utf8");
const HAND_ACC = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06c-hand.json",
);
const hand = load(HAND_ACC);
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06c.json",
);
const importData = load(IMPORT);
const byKey = new Map(
  importData.records.map((r) => [`${r.productId}:${r.targetLang}`, r]),
);

// Fill any missing spec keys by translating source spec values per-language
// using techJson patterns; and missing alt entries.
const SPEC_VAL_MAP = {
  "Không dây 2.4Ghz;Bluetooth;USB-C to USB-A": {
    en: "Wireless 2.4GHz;Bluetooth;USB-C to USB-A",
    pt: "Sem fios 2.4Ghz;Bluetooth;USB-C to USB-A",
    fr: "Sans fil 2.4GHz;Bluetooth;USB-C vers USB-A",
    de: "Kabellos 2.4GHz;Bluetooth;USB-C zu USB-A",
    it: "Wireless 2.4GHz;Bluetooth;USB-C a USB-A",
    es: "Inalámbrico 2.4GHz;Bluetooth;USB-C a USB-A",
    nl: "Draadloos 2.4GHz;Bluetooth;USB-C naar USB-A",
    sv: "Trådlös 2.4GHz;Bluetooth;USB-C till USB-A",
  },
};
const VN_SPEC_WORDS = [
  [
    /Không dây/gi,
    {
      en: "Wireless",
      pt: "Sem fios",
      fr: "Sans fil",
      de: "Kabellos",
      it: "Wireless",
      es: "Inalámbrico",
      nl: "Draadloos",
      sv: "Trådlös",
    },
  ],
  [
    /có dây/gi,
    {
      en: "Wired",
      pt: "Com fios",
      fr: "Filaire",
      de: "Kabelgebunden",
      it: "Cablato",
      es: "Con cable",
      nl: "Bedraad",
      sv: "Trådbunden",
    },
  ],
  [
    /trắng/gi,
    {
      en: "white",
      pt: "branco",
      fr: "blanc",
      de: "weiß",
      it: "bianco",
      es: "blanco",
      nl: "wit",
      sv: "vit",
    },
  ],
  [
    /đen/gi,
    {
      en: "black",
      pt: "preto",
      fr: "noir",
      de: "schwarz",
      it: "nero",
      es: "negro",
      nl: "zwart",
      sv: "svart",
    },
  ],
  [
    /hồng/gi,
    {
      en: "pink",
      pt: "rosa",
      fr: "rose",
      de: "rosa",
      it: "rosa",
      es: "rosa",
      nl: "roze",
      sv: "rosa",
    },
  ],
  [
    /lục/gi,
    {
      en: "green",
      pt: "verde",
      fr: "vert",
      de: "grün",
      it: "verde",
      es: "verde",
      nl: "groen",
      sv: "grön",
    },
  ],
  [
    /đỏ/gi,
    {
      en: "red",
      pt: "vermelho",
      fr: "rouge",
      de: "rot",
      it: "rosso",
      es: "rojo",
      nl: "rood",
      sv: "röd",
    },
  ],
  [
    /xanh/gi,
    {
      en: "blue",
      pt: "azul",
      fr: "bleu",
      de: "blau",
      it: "blu",
      es: "azul",
      nl: "blauw",
      sv: "blå",
    },
  ],
  [
    /tốc độ/gi,
    {
      en: "speed",
      pt: "velocidade",
      fr: "vitesse",
      de: "Geschwindigkeit",
      it: "velocità",
      es: "velocidad",
      nl: "snelheid",
      sv: "hastighet",
    },
  ],
  [
    /kết nối/gi,
    {
      en: "connection",
      pt: "ligação",
      fr: "connexion",
      de: "Verbindung",
      it: "connessione",
      es: "conexión",
      nl: "verbinding",
      sv: "anslutning",
    },
  ],
  [
    /linh hoạt/gi,
    {
      en: "flexible",
      pt: "flexível",
      fr: "flexible",
      de: "flexibel",
      it: "flessibile",
      es: "flexible",
      nl: "flexibel",
      sv: "flexibel",
    },
  ],
  [
    /siêu tốc/gi,
    {
      en: "ultra-fast",
      pt: "ultrarrápida",
      fr: "ultrarapide",
      de: "ultraschnell",
      it: "ultra-veloce",
      es: "ultrarrápida",
      nl: "ultrasnel",
      sv: "ultrasnabb",
    },
  ],
];
function transSpecVal(v, lang) {
  if (SPEC_VAL_MAP[v]) return SPEC_VAL_MAP[v][lang];
  let out = v;
  for (const [re, words] of VN_SPEC_WORDS)
    out = out.replace(re, words[lang] || "");
  return out;
}
function transAlt(alt, lang) {
  let out = alt;
  for (const [re, words] of VN_SPEC_WORDS)
    out = out.replace(re, words[lang] || "");
  return out;
}

for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    const rec = byKey.get(`${pid}:${lang}`);
    if (!rec) continue;
    // Fill missing spec keys
    for (const [k, v] of Object.entries(rec.source.specs || {})) {
      if (t.specs[k] === undefined || t.specs[k] === "") {
        t.specs[k] = transSpecVal(String(v), lang);
      }
    }
    // Fill missing alts
    const srcAlts = (rec.source.descriptionImages || []).map((i) =>
      String(i.alt || ""),
    );
    t.imageAlts = srcAlts.map((a) => {
      const i = srcAlts.indexOf(a);
      const cur = (rec.translations.descriptionImages || [])[i];
      if (cur && String(cur.alt || "").trim()) return cur.alt;
      return transAlt(a, lang);
    });
  }
}
save(HAND_ACC, hand);
console.log("specs/alts filled; rebuilding...");
