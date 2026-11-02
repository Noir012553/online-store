// Fix pass 5 — residual VN tokens in alts
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov08.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov08-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const TOKENS = [
  [
    /c777 - khóa ngoài/gi,
    {
      fr: "C777 - clé externe",
      nl: "C777 - externe sleutel",
      es: "C777 - llave externa",
      it: "C777 - chiave esterna",
      de: "C777 - externe Taste",
      pt: "C777 - tecla externa",
      sv: "C777 - extern tangent",
    },
  ],
  [
    /chuyên sâu/gi,
    {
      fr: "approfondie",
      en: "deep",
      it: "approfondita",
      nl: "diepgaande",
      sv: "djup",
      pt: "aprofundada",
      es: "profunda",
      de: "tief",
    },
  ],
  [
    /thể/gi,
    {
      fr: "corps",
      en: "body",
      it: "corpo",
      nl: "lichaam",
      sv: "kropp",
      pt: "corpo",
      es: "cuerpo",
      de: "Körper",
    },
  ],
  [
    /đối xứng thoải mái/gi,
    {
      en: "symmetrical comfort",
      fr: "symétrie confortable",
      it: "sinfonia confortevole",
      nl: "symmetrisch comfort",
      sv: "symmetrisk komfort",
      pt: "simetria confortável",
      es: "simetría cómoda",
      de: "symmetrischer Komfort",
    },
  ],
  [
    /đa dạng/gi,
    {
      en: "versatile",
      fr: "polyvalent",
      it: "versatile",
      nl: "veelzijdig",
      sv: "mångsidig",
      pt: "versátil",
      es: "versátil",
      de: "vielseitig",
    },
  ],
  [
    /giờ sử dụng/gi,
    {
      en: "hours of use",
      fr: "heures d'utilisation",
      it: "ore di utilizzo",
      nl: "uren gebruik",
      sv: "timmar användning",
      pt: "horas de uso",
      es: "horas de uso",
      de: "Stunden Nutzung",
    },
  ],
  [
    /khi/gi,
    {
      en: "when",
      fr: "quand",
      it: "quando",
      nl: "wanneer",
      sv: "när",
      pt: "quando",
      es: "cuando",
      de: "wenn",
    },
  ],
  [
    /thông minh/gi,
    {
      en: "smart",
      fr: "intelligent",
      it: "intelligente",
      nl: "slim",
      sv: "smart",
      pt: "inteligente",
      es: "inteligente",
      de: "intelligent",
    },
  ],
  [
    /trọng lượng siêu nhẹ/gi,
    {
      en: "ultralight weight",
      fr: "poids ultra-léger",
      it: "peso ultraleggero",
      nl: "ultralicht gewicht",
      sv: "ultralätt vikt",
      pt: "peso ultraleve",
      es: "peso ultraligero",
      de: "ultraleichtes Gewicht",
    },
  ],
  [
    /dứt khoát/gi,
    {
      en: "decisive",
      fr: "décisif",
      it: "decisivo",
      nl: "beslist",
      sv: "bestämt",
      pt: "decisivo",
      es: "decisivo",
      de: "entschlossen",
    },
  ],
  [
    /qua/gi,
    {
      en: "via",
      fr: "via",
      it: "tramite",
      nl: "via",
      sv: "via",
      pt: "via",
      es: "vía",
      de: "über",
    },
  ],
  [
    /chuyên sâu/gi,
    {
      en: "deep",
      fr: "profond",
      it: "profondo",
      nl: "diep",
      sv: "djup",
      pt: "profundo",
      es: "profundo",
      de: "tief",
    },
  ],
  [
    /cho cảm giác/gi,
    {
      en: "for feeling",
      fr: "pour la sensation",
      it: "per la sensazione",
      nl: "voor gevoel",
      sv: "för känsla",
      pt: "para sensação",
      es: "para sensación",
      de: "für Gefühl",
    },
  ],
  [
    /đối xứng/gi,
    {
      en: "symmetrical",
      fr: "symétrique",
      it: "simmetrico",
      nl: "symmetrisch",
      sv: "symmetrisk",
      pt: "simétrico",
      es: "simétrico",
      de: "symmetrisch",
    },
  ],
  [
    /hệ thống/gi,
    {
      en: "system",
      fr: "système",
      it: "système",
      nl: "systeem",
      sv: "system",
      pt: "sistema",
      es: "sistema",
      de: "System",
    },
  ],
  [
    /và/gi,
    {
      en: "and",
      fr: "et",
      it: "e",
      nl: "en",
      sv: "och",
      pt: "e",
      es: "y",
      de: "und",
    },
  ],
];

let n = 0;
for (const rec of d.records) {
  const lang = rec.targetLang;
  const images = rec.translations.descriptionImages || [];
  let changed = false;
  for (const im of images) {
    if (!im.alt) continue;
    let out = im.alt;
    for (const [re, words] of TOKENS) {
      if (words[lang]) out = out.replace(re, words[lang]);
    }
    if (out !== im.alt) {
      im.alt = out;
      changed = true;
    }
  }
  if (changed) {
    n++;
    const h = hand[rec.productId] && hand[rec.productId][lang];
    if (h) h.imageAlts = images.map((im) => im.alt);
  }
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
