// Fix pass 4 — translate remaining 411 VN alts (bold VN words + Chuột prefix + others)
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
    /chuột/gi,
    {
      en: "mouse",
      fr: "souris",
      it: "mouse",
      nl: "muis",
      sv: "mus",
      pt: "rato",
      es: "ratón",
      de: "Maus",
    },
  ],
  [
    /cảm biến hero/gi,
    {
      en: "HERO 2 sensor",
      fr: "capteur HERO 2",
      it: "sensore HERO 2",
      nl: "HERO 2-sensor",
      sv: "HERO 2-sensor",
      pt: "sensor HERO 2",
      es: "sensor HERO 2",
      de: "HERO 2-Sensor",
    },
  ],
  [
    /hero 2/gi,
    {
      en: "HERO 2",
      fr: "HERO 2",
      it: "HERO 2",
      nl: "HERO 2",
      sv: "HERO 2",
      pt: "HERO 2",
      es: "HERO 2",
      de: "HERO 2",
    },
  ],
  [
    /đột phá/gi,
    {
      en: "breakthrough",
      fr: "révolutionnaire",
      it: "rivoluzionario",
      nl: "baanbrekend",
      sv: "genombrotts- ",
      pt: "revolucionário",
      es: "revolucionario",
      de: "revolutionär",
    },
  ],
  [
    /tối giản/gi,
    {
      en: "minimalist",
      fr: "minimaliste",
      it: "minimalista",
      nl: "minimalistisch",
      sv: "minimalistisk",
      pt: "minimalista",
      es: "minimalista",
      de: "minimalistisch",
    },
  ],
  [
    /khiêm tốn/gi,
    {
      en: "modest",
      fr: "modeste",
      it: "modesto",
      nl: "bescheiden",
      sv: "blygsam",
      pt: "modesto",
      es: "modesto",
      de: "bescheiden",
    },
  ],
  [
    /cân nặng/gi,
    {
      en: "weight",
      fr: "poids",
      it: "peso",
      nl: "gewicht",
      sv: "vikt",
      pt: "peso",
      es: "peso",
      de: "Gewicht",
    },
  ],
  [
    /hiện đại/gi,
    {
      en: "modern",
      fr: "moderne",
      it: "moderno",
      nl: "modern",
      sv: "modern",
      pt: "moderno",
      es: "moderno",
      de: "modern",
    },
  ],
  [
    /chính xác/gi,
    {
      en: "precise",
      fr: "précis",
      it: "preciso",
      nl: "precies",
      sv: "precis",
      pt: "preciso",
      es: "preciso",
      de: "präzise",
    },
  ],
  [
    /khủng khiếp/gi,
    {
      en: "massive",
      fr: "massif",
      it: "enorme",
      nl: "enorm",
      sv: "enorm",
      pt: "enorme",
      es: "enorme",
      de: "enorm",
    },
  ],
  [
    /hệ thống/gi,
    {
      en: "system",
      fr: "système",
      it: "sistema",
      nl: "systeem",
      sv: "system",
      pt: "sistema",
      es: "sistema",
      de: "System",
    },
  ],
  [
    /bộ nhớ/gi,
    {
      en: "memory",
      fr: "mémoire",
      it: "memoria",
      nl: "geheugen",
      sv: "minne",
      pt: "memória",
      es: "memoria",
      de: "Speicher",
    },
  ],
  [
    /sang trọng/gi,
    {
      en: "premium",
      fr: "premium",
      it: "premium",
      nl: "premium",
      sv: "premium",
      pt: "premium",
      es: "premium",
      de: "Premium",
    },
  ],
  [
    /vượt trội/gi,
    {
      en: "superior",
      fr: "supérieur",
      it: "superiore",
      nl: "superieur",
      sv: "överlägsen",
      pt: "superior",
      es: "superior",
      de: "überlegen",
    },
  ],
  [
    /sáng tạo/gi,
    {
      en: "creative",
      fr: "créatif",
      it: "creativo",
      nl: "creatief",
      sv: "kreativ",
      pt: "criativo",
      es: "creativo",
      de: "kreativ",
    },
  ],
  [
    /trong suốt/gi,
    {
      en: "crystal",
      fr: "transparent",
      it: "trasparente",
      nl: "transparant",
      sv: "transparent",
      pt: "transparente",
      es: "transparente",
      de: "transparent",
    },
  ],
  [
    /công nghệ/gi,
    {
      en: "technology",
      fr: "technologie",
      it: "tecnologia",
      nl: "technologie",
      sv: "teknologi",
      pt: "tecnologia",
      es: "tecnología",
      de: "Technologie",
    },
  ],
  [
    /tùy chỉnh/gi,
    {
      en: "customizable",
      fr: "personnalisable",
      it: "personalizzabile",
      nl: "aanpasbaar",
      sv: "anpassningsbar",
      pt: "personalizável",
      es: "personalizable",
      de: "anpassbar",
    },
  ],
  [
    /tối ưu/gi,
    {
      en: "optimized",
      fr: "optimisé",
      it: "ottimizzato",
      nl: "geoptimaliseerd",
      sv: "optimerad",
      pt: "otimizado",
      es: "optimizado",
      de: "optimiert",
    },
  ],
  [
    /hiệu quả/gi,
    {
      en: "efficient",
      fr: "efficace",
      it: "efficiente",
      nl: "efficiënt",
      sv: "effektiv",
      pt: "eficiente",
      es: "eficiente",
      de: "effizient",
    },
  ],
  [
    /nâng cao/gi,
    {
      en: "advanced",
      fr: "avancé",
      it: "avanzato",
      nl: "geavanceerd",
      sv: "avancerad",
      pt: "avançado",
      es: "avanzado",
      de: "fortgeschritten",
    },
  ],
  [
    /mạnh mẽ/gi,
    {
      en: "powerful",
      fr: "puissant",
      it: "potente",
      nl: "krachtig",
      sv: "kraftfull",
      pt: "poderoso",
      es: "potente",
      de: "leistungsstark",
    },
  ],
  [
    /thể tùy chỉnh chuyên sâu/gi,
    {
      en: "deep customization",
      fr: "personnalisation approfondie",
      it: "personalizzazione approfondita",
      nl: "diepgaande aanpassing",
      sv: "djup anpassning",
      pt: "personalização profunda",
      es: "personalización profunda",
      de: "tiefe Anpassung",
    },
  ],
  [
    /viên batería/gi,
    {
      en: "battery",
      fr: "batterie",
      it: "batteria",
      nl: "batterij",
      sv: "batteri",
      pt: "bateria",
      es: "batería",
      de: "Akku",
    },
  ],
  [
    /và rendimiento cao/gi,
    {
      en: "and high performance",
      fr: "et hautes performances",
      it: "e alte prestazioni",
      nl: "en hoge prestaties",
      sv: "och hög prestanda",
      pt: "e alto desempenho",
      es: "y alto rendimiento",
      de: "und hohe Leistung",
    },
  ],
  [
    /két/gi,
    {
      en: "case",
      fr: "étui",
      it: "custodia",
      nl: "huls",
      sv: "fodral",
      pt: "estojo",
      es: "estuche",
      de: "Gehäuse",
    },
  ],
  [
    /mượt mà/gi,
    {
      en: "smooth",
      fr: "fluide",
      it: "fluido",
      nl: "vloeiend",
      sv: "mjuk",
      pt: "suave",
      es: "suave",
      de: "flüssig",
    },
  ],
  [
    /bền bỉ/gi,
    {
      en: "durable",
      fr: "durable",
      it: "durevole",
      nl: "duurzaam",
      sv: "hållbar",
      pt: "durável",
      es: "durable",
      de: "langlebig",
    },
  ],
  [
    /hổ trợ/gi,
    {
      en: "supports",
      fr: "prend en charge",
      it: "supporta",
      nl: "ondersteunt",
      sv: "stödjer",
      pt: "suporta",
      es: "soporta",
      de: "unterstützt",
    },
  ],
  [
    /công thái học/gi,
    {
      en: "ergonomic",
      fr: "ergonomique",
      it: "ergonomico",
      nl: "ergonomisch",
      sv: "ergonomisk",
      pt: "ergonômico",
      es: "ergonómico",
      de: "ergonomisch",
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
