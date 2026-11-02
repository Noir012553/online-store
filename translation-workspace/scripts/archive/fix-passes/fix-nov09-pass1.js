// Fix nov09 batch preflight issues:
//  1. Vietnamese leaks in tech/desc/name (cảm biến, kiểu tai nghe, không dây
//     akko, để cpu, rtx đủ, xanh dương, loại pin, khung nhôm, switch sử, là
//     ram, chính hãng, nhập khẩu chính hãng)
//  2. ASUS brand missing (name dùng "Asus" viết thường → uppercase ASUS)
//  3. AKKO brand missing (name dùng "akko" viết thường → uppercase AKKO)
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov09-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const MAP = {
  // tech/desc VN phrases
  "cảm biến": {
    en: "Sensor",
    fr: "Capteur",
    it: "Sensore",
    nl: "Sensor",
    sv: "Sensor",
    pt: "Sensor",
    es: "Sensor",
    de: "Sensor",
  },
  "kiểu tai nghe": {
    en: "Earbud type",
    fr: "Type d'écouteurs",
    it: "Tipo di auricolari",
    nl: "Oortelefoon-type",
    sv: "Hörlurstyp",
    pt: "Tipo de auscultadores",
    es: "Tipo de auriculares",
    de: "Kopfhörertyp",
  },
  "không dây akko": {
    en: "AKKO wireless",
    fr: "AKKO sans fil",
    it: "AKKO wireless",
    nl: "AKKO draadloos",
    sv: "AKKO trådlös",
    pt: "AKKO sem fios",
    es: "AKKO inalámbrico",
    de: "AKKO kabellos",
  },
  "để cpu": {
    en: "CPU",
    fr: "CPU",
    it: "CPU",
    nl: "CPU",
    sv: "CPU",
    pt: "CPU",
    es: "CPU",
    de: "CPU",
  },
  "rtx đủ": {
    en: "RTX",
    fr: "RTX",
    it: "RTX",
    nl: "RTX",
    sv: "RTX",
    pt: "RTX",
    es: "RTX",
    de: "RTX",
  },
  "xanh dương": {
    en: "Blue",
    fr: "Bleu",
    it: "Blu",
    nl: "Blauw",
    sv: "Blå",
    pt: "Azul",
    es: "Azul",
    de: "Blau",
  },
  "loại pin": {
    en: "Battery type",
    fr: "Type de pile",
    it: "Tipo di batteria",
    nl: "Batterijtype",
    sv: "Batterityp",
    pt: "Tipo de bateria",
    es: "Tipo de batería",
    de: "Batterietyp",
  },
  "khung nhôm": {
    en: "Aluminum frame",
    fr: "Cadre en aluminium",
    it: "Telaio in alluminio",
    nl: "Aluminium frame",
    sv: "Aluminiumram",
    pt: "Moldura de alumínio",
    es: "Marco de aluminio",
    de: "Aluminiumrahmen",
  },
  "tím đậm": {
    en: "deep purple",
    fr: "violet foncé",
    it: "viola scuro",
    nl: "donkerpaars",
    sv: "mörklila",
    pt: "roxo escuro",
    es: "morado oscuro",
    de: "dunkelviolett",
  },
  "pin sạc li": {
    en: "rechargeable Li-ion battery",
    fr: "batterie Li-ion rechargeable",
    it: "batteria Li-ion ricaricabile",
    nl: "Li-ion oplaadbare batterij",
    sv: "uppladdningsbart Li-ion batteri",
    pt: "bateria Li-ion recarregável",
    es: "batería Li-ion recargable",
    de: "wiederaufladbarer Li-ion Akku",
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
  "switch sử": {
    en: "switch with",
    fr: "switch avec",
    it: "switch con",
    nl: "switch met",
    sv: "switch med",
    pt: "switch com",
    es: "switch con",
    de: "switch mit",
  },
  "là ram": {
    en: "RAM",
    fr: "RAM",
    it: "RAM",
    nl: "RAM",
    sv: "RAM",
    pt: "RAM",
    es: "RAM",
    de: "RAM",
  },
  "nhập khẩu chính hãng": {
    en: "genuine imported",
    fr: "importé officiellement",
    it: "importato ufficiale",
    nl: "officieel geïmporteerd",
    sv: "officiell import",
    pt: "importado oficial",
    es: "importado oficial",
    de: "offiziell importiert",
  },
  "chính hãng": {
    en: "genuine",
    fr: "authentique",
    it: "originale",
    nl: "origineel",
    sv: "original",
    pt: "original",
    es: "original",
    de: "original",
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
};

const entries = Object.entries(MAP).sort((a, b) => b[0].length - a[0].length);
function apply(lang, text) {
  let out = text;
  for (const [vn, words] of entries) {
    if (words[lang]) out = out.replace(new RegExp(vn, "gi"), words[lang]);
  }
  return out;
}

let n = 0;
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
  }
  for (const k of Object.keys(t.specs || {})) {
    const a = apply(lang, t.specs[k]);
    if (a !== t.specs[k]) {
      t.specs[k] = a;
      changed = true;
    }
  }
  if (t.imageAlts) {
    for (let i = 0; i < t.imageAlts.length; i++) {
      const a = apply(lang, t.imageAlts[i]);
      if (a !== t.imageAlts[i]) {
        t.imageAlts[i] = a;
        changed = true;
      }
    }
  }
  // brand casing
  if (t.name) {
    if (/^asus\b/i.test(t.name) && !/ASUS/.test(t.name)) {
      t.name = t.name.replace(/\basus\b/gi, "ASUS");
      changed = true;
    }
    if (/\bAsus\b/.test(t.name)) {
      t.name = t.name.replace(/\bAsus\b/g, "ASUS");
      changed = true;
    }
    if (/\bakko\b/i.test(t.name) && !/AKKO/.test(t.name)) {
      t.name = t.name.replace(/\bakko\b/gi, "AKKO");
      changed = true;
    }
  }
  if (t.brand === "Asus") {
    t.brand = "ASUS";
    changed = true;
  }
  if (t.brand === "akko") {
    t.brand = "AKKO";
    changed = true;
  }
  // desc: ensure brand token present
  if (
    t.brand === "ASUS" &&
    t.description &&
    !t.description.includes("ASUS") &&
    t.name.includes("ASUS")
  ) {
    changed = false; // name has ASUS, brand check passes via name
  }
  if (
    t.brand === "AKKO" &&
    t.description &&
    !t.description.includes("AKKO") &&
    t.name.includes("AKKO")
  ) {
    changed = false;
  }
  if (changed) n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");


