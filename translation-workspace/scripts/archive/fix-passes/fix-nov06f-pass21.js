// Fix pass 21 — fix all 57 leaks from leak-scan on nov06f import file.
// Each phrase maps to a per-language translation; applied to the specific
// field that the scan reported.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

// Phrase → per-language replacement (case-insensitive)
const TR = {
  "xanh lá": {
    en: "green",
    fr: "vert",
    it: "verde",
    nl: "groen",
    sv: "grön",
    pt: "verde",
    es: "verde",
    de: "grün",
  },
  "pro rgb đen dream": {
    en: "pro rgb black dream",
    fr: "pro rgb noir dream",
    it: "pro rgb nero dream",
    nl: "pro rgb zwart dream",
    sv: "pro rgb svart dream",
    pt: "pro rgb preto dream",
    es: "pro rgb negro dream",
    de: "pro rgb schwarz dream",
  },
  "cổng usb": {
    en: "USB port",
    fr: "Port USB",
    it: "Porta USB",
    nl: "USB-poort",
    sv: "USB-port",
    pt: "Porta USB",
    es: "Puerto USB",
    de: "USB-Anschluss",
  },
  "black sử": {
    en: "black with",
    fr: "noir avec",
    it: "nero con",
    nl: "zwart met",
    sv: "svart med",
    pt: "preto com",
    es: "negro con",
    de: "schwarz mit",
  },
  "trắng ngà": {
    en: "ivory",
    fr: "ivoire",
    it: "avorio",
    nl: "ivoor",
    sv: "elfenben",
    pt: "marfim",
    es: "marfil",
    de: "elfenbein",
  },
  "kim loại": {
    en: "metal",
    fr: "métal",
    it: "metallo",
    nl: "metaal",
    sv: "metall",
    pt: "metal",
    es: "metal",
    de: "Metall",
  },
  "đa kết nối": {
    en: "multi-connection",
    fr: "multi-connexion",
    it: "multi-connessione",
    nl: "multi-verbinding",
    sv: "flera anslutningar",
    pt: "multi-ligação",
    es: "multi-conexión",
    de: "multi-verbindung",
  },
  "cảm biến hero": {
    en: "HERO 2 sensor",
    fr: "capteur HERO 2",
    it: "sensore HERO 2",
    nl: "HERO 2-sensor",
    sv: "HERO 2-sensor",
    pt: "sensor HERO 2",
    es: "sensor HERO 2",
    de: "HERO 2-Sensor",
  },
  sử: {
    en: "with",
    fr: "avec",
    it: "con",
    nl: "met",
    sv: "med",
    pt: "com",
    es: "con",
    de: "mit",
  },
};

let fixed = 0;
for (const rec of d.records) {
  const lang = rec.targetLang;
  let changed = false;
  const apply = (text) => {
    let out = text;
    for (const [vn, words] of Object.entries(TR)) {
      if (words[lang]) out = out.replace(new RegExp(vn, "gi"), words[lang]);
    }
    return out;
  };
  const t = rec.translations;
  for (const f of ["name", "description", "technicalDescription"]) {
    if (t[f]) {
      const after = apply(t[f]);
      if (after !== t[f]) {
        t[f] = after;
        changed = true;
      }
    }
    if (hand[rec.productId] && hand[rec.productId][lang]) {
      const hb = hand[rec.productId][lang][f];
      if (hb) {
        const ha = apply(hb);
        if (ha !== hb) {
          hand[rec.productId][lang][f] = ha;
        }
      }
    }
  }
  for (const k of Object.keys(t.specs || {})) {
    const a = apply(t.specs[k]);
    if (a !== t.specs[k]) {
      t.specs[k] = a;
      changed = true;
    }
    if (
      hand[rec.productId] &&
      hand[rec.productId][lang] &&
      hand[rec.productId][lang].specs
    ) {
      if (t.specs[k] !== hand[rec.productId][lang].specs[k])
        hand[rec.productId][lang].specs[k] = t.specs[k];
    }
  }
  if (changed) fixed++;
}
console.log("records fixed:", fixed);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
