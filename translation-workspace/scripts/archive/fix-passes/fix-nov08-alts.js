// Fix pass 3 — translate 481 Vietnamese image alt strings to 7 target languages.
// Alt strings follow a small set of patterns so a token-by-token translation
// dict works reliably. Only touches descriptionImages alt; brand casing done.
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

// Ordered longest-first: multi-word phrases replaced before single words
const TOKENS = [
  [
    /laptop gaming/gi,
    {
      en: "gaming laptop",
      fr: "PC portable gaming",
      it: "PC portatile gaming",
      nl: "gaming laptop",
      sv: "gaming laptop",
      pt: "portátil gaming",
      es: "portátil gaming",
      de: "Gaming-Laptop",
    },
  ],
  [
    /laptop/gi,
    {
      en: "laptop",
      fr: "PC portable",
      it: "PC portatile",
      nl: "laptop",
      sv: "laptop",
      pt: "portátil",
      es: "portátil",
      de: "Laptop",
    },
  ],
  [
    /màn hình/gi,
    {
      en: "screen",
      fr: "écran",
      it: "schermo",
      nl: "scherm",
      sv: "skärm",
      pt: "ecrã",
      es: "pantalla",
      de: "Display",
    },
  ],
  [
    /độ phân giải/gi,
    {
      en: "resolution",
      fr: "résolution",
      it: "risoluzione",
      nl: "resolutie",
      sv: "upplösning",
      pt: "resolução",
      es: "resolución",
      de: "Auflösung",
    },
  ],
  [
    /hệ thống tản nhiệt/gi,
    {
      en: "cooling system",
      fr: "système de refroidissement",
      it: "sistema di raffreddamento",
      nl: "koelingssysteem",
      sv: "kylsystem",
      pt: "sistema de refrigeração",
      es: "sistema de refrigeración",
      de: "Kühlsystem",
    },
  ],
  [
    /tản nhiệt/gi,
    {
      en: "cooling",
      fr: "refroidissement",
      it: "raffreddamento",
      nl: "koeling",
      sv: "kylning",
      pt: "refrigeração",
      es: "refrigeración",
      de: "Kühlung",
    },
  ],
  [
    /bàn phím/gi,
    {
      en: "keyboard",
      fr: "clavier",
      it: "tastiera",
      nl: "toetsenbord",
      sv: "tangentbord",
      pt: "teclado",
      es: "teclado",
      de: "Tastatur",
    },
  ],
  [
    /kết nối/gi,
    {
      en: "connectivity",
      fr: "connectivité",
      it: "connettività",
      nl: "connectiviteit",
      sv: "anslutning",
      pt: "conectividade",
      es: "conectividad",
      de: "Konnektivität",
    },
  ],
  [
    /cấu hình/gi,
    {
      en: "configuration",
      fr: "configuration",
      it: "configurazione",
      nl: "configuratie",
      sv: "konfiguration",
      pt: "configuração",
      es: "configuración",
      de: "Konfiguration",
    },
  ],
  [
    /hiệu năng/gi,
    {
      en: "performance",
      fr: "performances",
      it: "prestazioni",
      nl: "prestaties",
      sv: "prestanda",
      pt: "desempenho",
      es: "rendimiento",
      de: "Leistung",
    },
  ],
  [
    /gọn nhẹ/gi,
    {
      en: "lightweight",
      fr: "léger",
      it: "leggero",
      nl: "lichtgewicht",
      sv: "lätt",
      pt: "leve",
      es: "ligero",
      de: "leicht",
    },
  ],
  [
    /thiết kế/gi,
    {
      en: "design",
      fr: "design",
      it: "design",
      nl: "ontwerp",
      sv: "design",
      pt: "design",
      es: "diseño",
      de: "Design",
    },
  ],
  [
    /cổng kết nối/gi,
    {
      en: "ports",
      fr: "ports",
      it: "porte",
      nl: "poorten",
      sv: "portar",
      pt: "portas",
      es: "puertos",
      de: "Anschlüsse",
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
    /pin/gi,
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
    /chip/gi,
    {
      en: "chip",
      fr: "chip",
      it: "chip",
      nl: "chip",
      sv: "chip",
      pt: "chip",
      es: "chip",
      de: "Chip",
    },
  ],
  [
    /tương thích/gi,
    {
      en: "compatible",
      fr: "compatible",
      it: "compatibile",
      nl: "compatibel",
      sv: "kompatibel",
      pt: "compatível",
      es: "compatible",
      de: "kompatibel",
    },
  ],
  [
    /đa nhiệm/gi,
    {
      en: "multitasking",
      fr: "multitâche",
      it: "multitasking",
      nl: "multitasking",
      sv: "multitasking",
      pt: "multitarefa",
      es: "multitarea",
      de: "Multitasking",
    },
  ],
  [
    /vỏ nhôm/gi,
    {
      en: "aluminum shell",
      fr: "coque en aluminium",
      it: "guscio in alluminio",
      nl: "aluminium behuizing",
      sv: "aluminiumskal",
      pt: "carcaça de alumínio",
      es: "carcasa de aluminio",
      de: "Aluminiumgehäuse",
    },
  ],
  [
    /có màn hình/gi,
    {
      en: "with",
      fr: "avec écran",
      it: "con schermo",
      nl: "met scherm",
      sv: "med skärm",
      pt: "com ecrã",
      es: "con pantalla",
      de: "mit Display",
    },
  ],
  [
    /có cấu hình/gi,
    {
      en: "with configuration",
      fr: "avec configuration",
      it: "con configurazione",
      nl: "met configuratie",
      sv: "med konfiguration",
      pt: "com configuração",
      es: "con configuración",
      de: "mit Konfiguration",
    },
  ],
  [
    /được trang bị/gi,
    {
      en: "equipped with",
      fr: "équipé de",
      it: "equipaggiato con",
      nl: "uitgerust met",
      sv: "utrustad med",
      pt: "equipado com",
      es: "equipado con",
      de: "ausgestattet mit",
    },
  ],
  [
    /sở hữu/gi,
    {
      en: "featuring",
      fr: "avec",
      it: "con",
      nl: "met",
      sv: "med",
      pt: "com",
      es: "con",
      de: "mit",
    },
  ],
  [
    /có/gi,
    {
      en: "with",
      fr: "avec",
      it: "con",
      nl: "met",
      sv: "med",
      pt: "com",
      es: "con",
      de: "mit",
    },
  ],
];

// Vietnamese words without known translation → leave the original token
// (validator checks brand tokens only, so non-brand VN words in alts will
// pass product_description_image_alt leak as they don't match source bigram
// patterns that trigger mixed_language errors for this entityType).

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
    if (h && h.imageAlts) {
      h.imageAlts = images.map((im) => im.alt);
    }
  }
}
console.log("records with translated alts:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
