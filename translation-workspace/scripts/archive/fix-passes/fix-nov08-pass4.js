// Fix nov08 pass 4 — last 60 alt leaks
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov08.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));

const TR = {
  "ba chế độ": {
    en: "three modes",
    fr: "trois modes",
    it: "tre modalità",
    nl: "drie modi",
    sv: "tre lägen",
    pt: "três modos",
    es: "tres modos",
    de: "drei Modi",
  },
  "home quen thuộc": {
    en: "familiar Home",
    fr: "Home familier",
    it: "Home familiare",
    nl: "bekende Home",
    sv: "bekant Home",
    pt: "Home familiar",
    es: "Home familiar",
    de: "vertrautes Home",
  },
  "đa dụng": {
    en: "versatile",
    fr: "polyvalent",
    it: "polivalente",
    nl: "veelzijdig",
    sv: "mångsidig",
    pt: "versátil",
    es: "versátil",
    de: "vielseitig",
  },
  "sự thuận tiện": {
    en: "convenience",
    fr: "commodité",
    it: "comodità",
    nl: "gemak",
    sv: "bekvämlighet",
    pt: "conveniência",
    es: "comodidad",
    de: "Bequemlichkeit",
  },
  "triệu lần nhấn": {
    en: "million presses",
    fr: "millions de pressions",
    it: "milioni di pressioni",
    nl: "miljoen toetsaanslagen",
    sv: "miljoner tryckningar",
    pt: "milhões de pressionamentos",
    es: "millones de pulsaciones",
    de: "Millionen Tastendrücke",
  },
  "hiết bị": {
    en: "device",
    fr: "appareil",
    it: "dispositivo",
    nl: "apparaat",
    sv: "enhet",
    pt: "dispositivo",
    es: "dispositivo",
    de: "Gerät",
  },
  "kích thước lớn lên": {
    en: "large size",
    fr: "grande taille",
    it: "grande dimensioni",
    nl: "grote afmetingen",
    sv: "stor storlek",
    pt: "grande tamanho",
    es: "gran tamaño",
    de: "große Größe",
  },
  "còn được tích hợp": {
    en: "also integrates",
    fr: "également intégré",
    it: "anche integrato",
    nl: "ook geïntegreerd",
    sv: "även integrerad",
    pt: "também integrado",
    es: "también integrado",
    de: "auch integriert",
  },
  "phiên bản": {
    en: "version",
    fr: "version",
    it: "versione",
    nl: "versie",
    sv: "version",
    pt: "versão",
    es: "versión",
    de: "Version",
  },
  "nghiệm gõ": {
    en: "typing feel",
    fr: "sensation de frappe",
    it: "sensazione di digitazione",
    nl: "typgevoel",
    sv: "skrivkänsla",
    pt: "sensação de digitação",
    es: "sensación de tecleo",
    de: "Tippgefühl",
  },
  "lâu dài": {
    en: "long-term",
    fr: "à long terme",
    it: "a lungo termine",
    nl: "op lange termijn",
    sv: "långsiktig",
    pt: "a longo prazo",
    es: "a largo plazo",
    de: "langfristig",
  },
  "ear siêu nhẹ": {
    en: "ultralight ear",
    fr: "oreillette ultra-légère",
    it: "cuffia ultraleggera",
    nl: "ultralichte oordop",
    sv: "ultralätt öronmuffe",
    pt: "auricular ultraleve",
    es: "auricular ultraligero",
    de: "ultraleichter Ohrhörer",
  },
  "chất âm cân bằng": {
    en: "balanced sound",
    fr: "son équilibré",
    it: "suono bilanciato",
    nl: "gebalanceerd geluid",
    sv: "balanserat ljud",
    pt: "som equilibrado",
    es: "sonido equilibrado",
    de: "ausgeglichener Klang",
  },
  "tiện lợi": {
    en: "convenient",
    fr: "pratique",
    it: "comodo",
    nl: "handig",
    sv: "bekväm",
    pt: "conveniente",
    es: "conveniente",
    de: "praktisch",
  },
  "gaming đỉnh cao": {
    en: "top-tier gaming",
    fr: "gaming haut de gamme",
    it: "gaming di alto livello",
    nl: "topgaming",
    sv: "toppgaming",
    pt: "gaming de alto nível",
    es: "gaming de alto nivel",
    de: "Top-Gaming",
  },
};

const entries = Object.entries(TR).sort((a, b) => b[0].length - a[0].length);
function apply(lang, text) {
  let out = text;
  for (const [vn, w] of entries) {
    if (w[lang]) out = out.replace(new RegExp(vn, "gi"), w[lang]);
  }
  return out;
}

let n = 0;
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
  (t.descriptionImages || []).forEach((im) => {
    if (
      im.alt &&
      /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u.test(im.alt)
    ) {
      im.alt = apply(lang, im.alt);
      changed = true;
    }
  });
  if (changed) n++;
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
console.log("fixed:", n);
