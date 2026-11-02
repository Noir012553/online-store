// Fix nov09 pass 2 — remaining leak words + brand casing/correct brand tokens
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
  "có dây aula": {
    en: "wired AULA",
    fr: "AULA filaire",
    it: "AULA cablato",
    nl: "AULA bedraad",
    sv: "AULA trådbunden",
    pt: "AULA com fios",
    es: "AULA con cable",
    de: "AULA kabelgebunden",
  },
  "cảm biến": {
    en: "sensor",
    fr: "capteur",
    it: "sensore",
    nl: "sensor",
    sv: "sensor",
    pt: "sensor",
    es: "sensor",
    de: "Sensor",
  },
  "kết nối": {
    en: "connection",
    fr: "connexion",
    it: "connessione",
    nl: "verbinding",
    sv: "anslutning",
    pt: "ligação",
    es: "conexión",
    de: "Verbindung",
  },
  "kiểu tai nghe": {
    en: "earbud type",
    fr: "type d'écouteurs",
    it: "tipo di auricolari",
    nl: "oortelefoon-type",
    sv: "hörlurstyp",
    pt: "tipo de auscultadores",
    es: "tipo de auriculares",
    de: "Kopfhörertyp",
  },
  "xám đậm": {
    en: "dark gray",
    fr: "gris foncé",
    it: "grigio scuro",
    nl: "donkergrijs",
    sv: "mörkgrå",
    pt: "cinza escuro",
    es: "gris oscuro",
    de: "dunkelgrau",
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
  "việt nam": {
    en: "Vietnam",
    fr: "Vietnam",
    it: "Vietnam",
    nl: "Vietnam",
    sv: "Vietnam",
    pt: "Vietname",
    es: "Vietnam",
    de: "Vietnam",
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
  "đèn led": {
    en: "LED",
    fr: "LED",
    it: "LED",
    nl: "LED",
    sv: "LED",
    pt: "LED",
    es: "LED",
    de: "LED",
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
  "xám trắng": {
    en: "gray white",
    fr: "gris blanc",
    it: "grigio bianco",
    nl: "grijs wit",
    sv: "grå vit",
    pt: "cinza branco",
    es: "gris blanco",
    de: "grau weiß",
  },
  "thế laptop": {
    en: "laptop",
    fr: "laptop",
    it: "laptop",
    nl: "laptop",
    sv: "laptop",
    pt: "laptop",
    es: "laptop",
    de: "laptop",
  },
};

// ordered longest-first
const entries = Object.entries(MAP).sort((a, b) => b[0].length - a[0].length);
function apply(lang, text) {
  let out = text;
  for (const [vn, w] of entries)
    if (w[lang]) out = out.replace(new RegExp(vn, "gi"), w[lang]);
  return out;
}

let fixed = 0;
for (const rec of d.records) {
  const lang = rec.targetLang;
  const t = rec.translations;
  let changed = false;
  for (const f of ["name", "description", "technicalDescription"]) {
    if (t[f] && /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u.test(t[f])) {
      const a = apply(lang, t[f]);
      if (a !== t[f]) {
        t[f] = a;
        changed = true;
      }
    }
  }
  for (const k of Object.keys(t.specs || {})) {
    if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u.test(t.specs[k])) {
      t.specs[k] = apply(lang, t.specs[k]);
      changed = true;
    }
  }
  (t.descriptionImages || []).forEach((im) => {
    if (
      im.alt &&
      /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u.test(im.alt)
    ) {
      im.alt = apply(lang, im.alt);
      changed = true;
    }
  });
  // brand casing fixes: ensure ASUS in name+desc, AKKO in name+desc
  if (t.brand === "ASUS") {
    if (t.name && !t.name.includes("ASUS")) {
      t.name = t.name.replace(/\bAsus\b/g, "ASUS");
      changed = true;
    }
    if (t.description && !t.description.includes("ASUS")) {
      t.description = t.description.replace(/\bAsus\b/g, "ASUS");
      changed = true;
    }
  }
  if (t.brand === "AKKO") {
    if (t.name && !t.name.includes("AKKO")) {
      t.name = t.name.replace(/\bakko\b/gi, "AKKO");
      changed = true;
    }
    if (t.description && !t.description.includes("AKKO")) {
      t.description = t.description.replace(/\bakko\b/gi, "AKKO");
      changed = true;
    }
  }
  if (changed) {
    fixed++;
    const h = hand[rec.productId] && hand[rec.productId][lang];
    if (h) {
      for (const f of ["name", "description", "technicalDescription"])
        h[f] = t[f];
      h.specs = t.specs;
      h.imageAlts = (t.descriptionImages || []).map((im) => im.alt);
      h.brand = t.brand;
    }
  }
}
console.log("records fixed:", fixed);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
