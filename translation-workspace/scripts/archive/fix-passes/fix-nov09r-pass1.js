// Fix nov09 round-2 leaks (30 records):
//  - c891: "kết nối" (tech) → per-language "connection" label; "cảm biến" → Sensor
//  - c7ca: "kiểu tai nghe" → Earbud type / equivalent
//  - c8c3: "night over the rhône" → "Starry Night (Rhône)" / per-language
//  - c6ef: "có dây aula" → wired AULA per-language
//  - c88c: "cảm biến" → Sensor
//  - c792: "nhập khẩu chính hãng" → genuine imported
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
  "có dây aula": {
    en: "wired AULA",
    fr: "AULA filaire",
    it: "AULA cablata",
    nl: "bedrade AULA",
    sv: "trådbunden AULA",
    pt: "AULA com fios",
    es: "AULA con cable",
    de: "kabelgebundene AULA",
  },
};

const NIGHT_SUB = {
  en: ["Night over the Rhône", "Night (Rhône)"],
  fr: ["Nuit sur le Rhône", "Nuit (Rhône)"],
  de: ["Nacht über der Rhône", "Nacht (Rhône)"],
  it: ["Notte sul Rodano", "Notte (Rodano)"],
  es: ["Noche sobre el Ródano", "Noche (Ródano)"],
  nl: ["Nacht over de Rhône", "Nacht (Rhône)"],
  sv: ["Natt över Rhône", "Natt (Rhône)"],
  pt: ["Noite sobre o Ródano", "Noite (Ródano)"],
};

const TAILS = ["c891", "c7ca", "c8c3", "c6ef", "c88c", "c792"];
let n = 0;
for (const rec of d.records) {
  const tail = rec.productId.slice(-4);
  if (!TAILS.includes(tail)) continue;
  const lang = rec.targetLang;
  const t = rec.translations;
  let changed = false;
  const apply = (text) => {
    let out = String(text);
    for (const [vn, words] of Object.entries(MAP)) {
      if (words[lang]) out = out.replace(new RegExp(vn, "gi"), words[lang]);
    }
    if (tail === "c8c3") {
      const [from, to] = NIGHT_SUB[lang] || NIGHT_SUB.en;
      out = out.replace(new RegExp(from, "gi"), to);
      out = out.replace(/night over the rhône/gi, to);
    }
    return out;
  };
  for (const f of ["name", "description", "technicalDescription"]) {
    if (t[f]) {
      const a = apply(t[f]);
      if (a !== t[f]) {
        t[f] = a;
        changed = true;
      }
    }
  }
  for (const k of Object.keys(t.specs || {})) {
    const a = apply(t.specs[k]);
    if (a !== t.specs[k]) {
      t.specs[k] = a;
      changed = true;
    }
  }
  if (hand[rec.productId] && hand[rec.productId][lang]) {
    const h = hand[rec.productId][lang];
    for (const f of ["name", "description", "technicalDescription"]) {
      if (h[f]) h[f] = apply(h[f]);
    }
    for (const k of Object.keys(h.specs || {})) h.specs[k] = apply(h.specs[k]);
  }
  if (changed) n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
