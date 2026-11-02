// Fix pass 23 — fix remaining 57 leaks with substring replaces applied on ALL
// fields, using case-sensitive VN phrase (as reported) but also loose matching.
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

const TR = {
  "hợp kim nhôm": {
    en: "aluminum alloy",
    fr: "alliège d'aluminium",
    it: "lega di alluminio",
    nl: "aluminiumlegering",
    sv: "aluminiumlegering",
    pt: "liga de alumínio",
    es: "aleación de aluminio",
    de: "Aluminiumlegierung",
  },
  "triệu màu": {
    en: "million colors",
    fr: "millions de couleurs",
    it: "milioni di colori",
    nl: "miljoen kleuren",
    sv: "miljoner färger",
    pt: "milhões de cores",
    es: "millones de colores",
    de: "Millionen Farben",
  },
  "pin sạc": {
    en: "rechargeable battery",
    fr: "batterie rechargeable",
    it: "batteria ricaricabile",
    nl: "oplaadbare batterij",
    sv: "uppladdningsbart batteri",
    pt: "bateria recarregável",
    es: "batería recargable",
    de: "wiederaufladbarer Akku",
  },
  "orange switch sử": {
    en: "orange switch with",
    fr: "orange switch avec",
    it: "orange switch con",
    nl: "orange switch met",
    sv: "orange switch med",
    pt: "orange switch com",
    es: "orange switch con",
    de: "orange switch mit",
  },
  "để akko": {
    en: "for akko",
    fr: "pour akko",
    it: "per akko",
    nl: "voor akko",
    sv: "för akko",
    pt: "para akko",
    es: "para akko",
    de: "für akko",
  },
  "piano pro switch để": {
    en: "piano pro switch for",
    fr: "piano pro switch pour",
    it: "piano pro switch per",
    nl: "piano pro switch voor",
    sv: "piano pro switch för",
    pt: "piano pro switch para",
    es: "piano pro switch para",
    de: "piano pro switch für",
  },
  "đen red switch": {
    en: "black red switch",
    fr: "noir red switch",
    it: "nero red switch",
    nl: "zwart red switch",
    sv: "svart red switch",
    pt: "preto red switch",
    es: "negro red switch",
    de: "schwarz red switch",
  },
  "cầu vòng": {
    en: "rainbow",
    fr: "arc-en-ciel",
    it: "arcobaleno",
    nl: "regenboog",
    sv: "regnbåge",
    pt: "arco-íris",
    es: "arcoíris",
    de: "Regenbogen",
  },
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
    de: "Elfenbein",
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
    de: "multi-Verbindung",
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
  "đen red switch": {
    en: "black red switch",
    fr: "noir red switch",
    it: "nero red switch",
    nl: "zwart red switch",
    sv: "svart red switch",
    pt: "preto red switch",
    es: "negro red switch",
    de: "schwarz red switch",
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
  đen: {
    en: "black",
    fr: "noir",
    it: "nero",
    nl: "zwart",
    sv: "svart",
    pt: "preto",
    es: "negro",
    de: "schwarz",
  },
  trắng: {
    en: "white",
    fr: "blanc",
    it: "bianco",
    nl: "wit",
    sv: "vit",
    pt: "branco",
    es: "blanco",
    de: "weiß",
  },
};

// Sort by length desc — longest phrases replaced first
const entries = Object.entries(TR).sort((a, b) => b[0].length - a[0].length);

function apply(lang, text) {
  let out = text;
  for (const [vn, words] of entries) {
    if (words[lang]) out = out.replace(new RegExp(vn, "gi"), words[lang]);
  }
  return out;
}

let fixed = 0;
for (const rec of d.records) {
  const lang = rec.targetLang;
  let changed = false;
  const t = rec.translations;
  for (const f of ["name", "description", "technicalDescription"]) {
    if (t[f]) {
      const a = apply(lang, t[f]);
      if (a !== t[f]) {
        t[f] = a;
        changed = true;
      }
    }
    if (hand[rec.productId] && hand[rec.productId][lang]) {
      const hb = hand[rec.productId][lang][f];
      if (hb) {
        const ha = apply(lang, hb);
        if (ha !== hb) {
          hand[rec.productId][lang][f] = ha;
        }
      }
    }
  }
  for (const k of Object.keys(t.specs || {})) {
    const a = apply(lang, t.specs[k]);
    if (a !== t.specs[k]) {
      t.specs[k] = a;
      changed = true;
    }
    if (hand[rec.productId] && hand[rec.productId][lang].specs) {
      if (t.specs[k] !== hand[rec.productId][lang].specs[k])
        hand[rec.productId][lang].specs[k] = t.specs[k];
    }
  }
  if (changed) fixed++;
}
console.log("records fixed:", fixed);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
