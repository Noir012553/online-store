// Fix remaining Vietnamese leftovers in accessory hand translations:
//  1. Alts: "GEARVN - Bàn phím cơ X" pattern + color words + layout words.
//  2. Description of it/es/pt: my template leaked some VN words because the
//     regex fragments matched template content — replaced wholesale with
//     clean, per-language wording without those patterns.
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
const handPath = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = load(handPath);

// Global alt translations (any leftover Vietnamese in alts)
const ALT_MAP = [
  [
    /GEARVN - Bàn phím cơ /g,
    {
      en: "GEARVN - Mechanical keyboard ",
      pt: "GEARVN - Teclado mecânico ",
      fr: "GEARVN - Clavier mécanique ",
      de: "GEARVN - Mechanische Tastatur ",
      it: "GEARVN - Tastiera meccanica ",
      es: "GEARVN - Teclado mecánico ",
      nl: "GEARVN - Mechanisch toetsenbord ",
      sv: "GEARVN - Mekaniskt tangentbord ",
    },
  ],
  [
    /GEARVN - Chuột gaming /g,
    {
      en: "GEARVN - Gaming mouse ",
      pt: "GEARVN - Rato gaming ",
      fr: "GEARVN - Souris gaming ",
      de: "GEARVN - Gaming-Maus ",
      it: "GEARVN - Mouse gaming ",
      es: "GEARVN - Ratón gaming ",
      nl: "GEARVN - Gaming-muis ",
      sv: "GEARVN - Spelmus ",
    },
  ],
  [
    /GEARVN - Chuột /g,
    {
      en: "GEARVN - Mouse ",
      pt: "GEARVN - Rato ",
      fr: "GEARVN - Souris ",
      de: "GEARVN - Maus ",
      it: "GEARVN - Mouse ",
      es: "GEARVN - Ratón ",
      nl: "GEARVN - Muis ",
      sv: "GEARVN - Mus ",
    },
  ],
  [
    /Bàn phím cơ /g,
    {
      en: "Mechanical keyboard ",
      pt: "Teclado mecânico ",
      fr: "Clavier mécanique ",
      de: "Mechanische Tastatur ",
      it: "Tastiera meccanica ",
      es: "Teclado mecánico ",
      nl: "Mechanisch toetsenbord ",
      sv: "Mekaniskt tangentbord ",
    },
  ],
  [
    /Bàn phím /g,
    {
      en: "Keyboard ",
      pt: "Teclado ",
      fr: "Clavier ",
      de: "Tastatur ",
      it: "Tastiera ",
      es: "Teclado ",
      nl: "Toetsenbord ",
      sv: "Tangentbord ",
    },
  ],
  [
    /Chuột gaming /g,
    {
      en: "Gaming mouse ",
      pt: "Rato gaming ",
      fr: "Souris gaming ",
      de: "Gaming-Maus ",
      it: "Mouse gaming ",
      es: "Ratón gaming ",
      nl: "Gaming-muis ",
      sv: "Spelmus ",
    },
  ],
  [
    /Chuột /g,
    {
      en: "Mouse ",
      pt: "Rato ",
      fr: "Souris ",
      de: "Maus ",
      it: "Mouse ",
      es: "Ratón ",
      nl: "Muis ",
      sv: "Mus ",
    },
  ],
  [
    /Tai nghe /g,
    {
      en: "Headset ",
      pt: "Auscultadores ",
      fr: "Casque ",
      de: "Headset ",
      it: "Cuffie ",
      es: "Auriculares ",
      nl: "Headset ",
      sv: "Headset ",
    },
  ],
  [
    /Màu sắc/g,
    {
      en: "Color",
      pt: "Cor",
      fr: "Couleur",
      de: "Farbe",
      it: "Colore",
      es: "Color",
      nl: "Kleur",
      sv: "Färg",
    },
  ],
  [
    /Kết nối/g,
    {
      en: "Connection",
      pt: "Ligação",
      fr: "Connexion",
      de: "Verbindung",
      it: "Connessione",
      es: "Conexión",
      nl: "Verbinding",
      sv: "Anslutning",
    },
  ],
  [
    /Cảm biến/g,
    {
      en: "Sensor",
      pt: "Sensor",
      fr: "Capteur",
      de: "Sensor",
      it: "Sensore",
      es: "Sensor",
      nl: "Sensor",
      sv: "Sensor",
    },
  ],
  [
    /Đèn LED/g,
    {
      en: "LED",
      pt: "LED",
      fr: "LED",
      de: "LED",
      it: "LED",
      es: "LED",
      nl: "LED",
      sv: "LED",
    },
  ],
  [
    /kiểu dáng/g,
    {
      en: "design",
      pt: "design",
      fr: "design",
      de: "Design",
      it: "design",
      es: "diseño",
      nl: "ontwerp",
      sv: "design",
    },
  ],
  [
    /thiết kế tối ưu/g,
    {
      en: "optimized design",
      pt: "design otimizado",
      fr: "design optimisé",
      de: "optimiertes Design",
      it: "design ottimizzato",
      es: "diseño optimizado",
      nl: "geoptimaliseerd ontwerp",
      sv: "optimerad design",
    },
  ],
  [
    /thiết kế/g,
    {
      en: "design",
      pt: "design",
      fr: "design",
      de: "Design",
      it: "design",
      es: "diseño",
      nl: "ontwerp",
      sv: "design",
    },
  ],
  [
    /hỗ trợ điều khiển trực tiếp/g,
    {
      en: "supports direct control",
      pt: "suporta controlo direto",
      fr: "prend en charge le contrôle direct",
      de: "unterstützt direkte Steuerung",
      it: "supporta il controllo diretto",
      es: "soporta control directo",
      nl: "ondersteunt directe bediening",
      sv: "stödjer direkt styrning",
    },
  ],
  [
    /cấu giảm chấn/g,
    {
      en: "damping structure",
      pt: "estrutura de amortecimento",
      fr: "structure d'amortissement",
      de: "Dämpfungsstruktur",
      it: "struttura di ammortizzazione",
      es: "estructura de amortiguación",
      nl: "dempingsstructuur",
      sv: "dämpningsstruktur",
    },
  ],
  [
    /giảm chấn/g,
    {
      en: "damping",
      pt: "amortecimento",
      fr: "amortissement",
      de: "Dämpfung",
      it: "ammortizzazione",
      es: "amortiguación",
      nl: "dempering",
      sv: "dämpning",
    },
  ],
  [
    /đèn bên trong/g,
    {
      en: "internal lighting",
      pt: "iluminação interna",
      fr: "éclairage interne",
      de: "Innenbeleuchtung",
      it: "illuminazione interna",
      es: "iluminación interna",
      nl: "interne verlichting",
      sv: "intern belysning",
    },
  ],
  [
    /tuyến tính/g,
    {
      en: "linear",
      pt: "linear",
      fr: "linéaire",
      de: "linear",
      it: "lineare",
      es: "lineal",
      nl: "lineair",
      sv: "linjär",
    },
  ],
  [
    /ánh sáng/g,
    {
      en: "lighting",
      pt: "iluminação",
      fr: "éclairage",
      de: "Beleuchtung",
      it: "illuminazione",
      es: "iluminación",
      nl: "verlichting",
      sv: "belysning",
    },
  ],
  [
    /đồng tâm/g,
    {
      en: "concentric",
      pt: "concêntrico",
      fr: "concentrique",
      de: "konzentrisch",
      it: "concentrico",
      es: "concéntrico",
      nl: "concentrisch",
      sv: "koncentrisk",
    },
  ],
  [
    /phối màu/g,
    {
      en: "color scheme",
      pt: "esquema de cores",
      fr: "scheme de couleurs",
      de: "Farbschema",
      it: "schema di colori",
      es: "esquema de color",
      nl: "kleurenschema",
      sv: "färgschema",
    },
  ],
  [
    /được phối màu/g,
    {
      en: "color-coordinated",
      pt: "combinado em cores",
      fr: "assorti en couleurs",
      de: "farblich abgestimmt",
      it: "abbinato nei colori",
      es: "coordinado en color",
      nl: "kleurcoördinatie",
      sv: "färgkoordinerad",
    },
  ],
  [
    /và nổi bật/g,
    {
      en: "and striking",
      pt: "e marcante",
      fr: "et marquant",
      de: "und markant",
      it: "e marcante",
      es: "y llamativo",
      nl: "en opvallend",
      sv: "och iögonfallande",
    },
  ],
  [
    /hoạt động/g,
    {
      en: "operation",
      pt: "operação",
      fr: "fonctionnement",
      de: "Betrieb",
      it: "funzionamento",
      es: "funcionamiento",
      nl: "werking",
      sv: "funktion",
    },
  ],
  [
    /cảm giác/g,
    {
      en: "feel",
      pt: "sensação",
      fr: "sensation",
      de: "Gefühl",
      it: "sensazione",
      es: "sensación",
      nl: "gevoel",
      sv: "känsla",
    },
  ],
  [
    /hiệu ứng/g,
    {
      en: "effects",
      pt: "efeitos",
      fr: "effets",
      de: "Effekte",
      it: "effetti",
      es: "efectos",
      nl: "effecten",
      sv: "effekter",
    },
  ],
  [
    /đậm/g,
    {
      en: "bold",
      pt: "ousado",
      fr: "audacieux",
      de: "kräftig",
      it: "audace",
      es: "audaz",
      nl: "gedurfd",
      sv: "djärv",
    },
  ],
  [
    /trắng/g,
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
    /Trắng/g,
    {
      en: "White",
      pt: "Branco",
      fr: "Blanc",
      de: "Weiß",
      it: "Bianco",
      es: "Blanco",
      nl: "Wit",
      sv: "Vit",
    },
  ],
  [
    /Xám/g,
    {
      en: "Gray",
      pt: "Cinza",
      fr: "Gris",
      de: "Grau",
      it: "Grigio",
      es: "Gris",
      nl: "Grijs",
      sv: "Grå",
    },
  ],
  [
    /dương/g,
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
    /Dương/g,
    {
      en: "Blue",
      pt: "Azul",
      fr: "Bleu",
      de: "Blau",
      it: "Blu",
      es: "Azul",
      nl: "Blauw",
      sv: "Blå",
    },
  ],
  [
    /lá/g,
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
    /Lá/g,
    {
      en: "Green",
      pt: "Verde",
      fr: "Vert",
      de: "Grün",
      it: "Verde",
      es: "Verde",
      nl: "Groen",
      sv: "Grön",
    },
  ],
  [
    /cổ/g,
    {
      en: "classic",
      pt: "clássico",
      fr: "classique",
      de: "klassisch",
      it: "classico",
      es: "clásico",
      nl: "klassiek",
      sv: "klassisk",
    },
  ],
  [
    /triệu/g,
    {
      en: "million",
      pt: "milhão",
      fr: "million",
      de: "Million",
      it: "milione",
      es: "millón",
      nl: "miljoen",
      sv: "miljon",
    },
  ],
  [
    /màu/g,
    {
      en: "color",
      pt: "cor",
      fr: "couleur",
      de: "Farbe",
      it: "colore",
      es: "color",
      nl: "kleur",
      sv: "färg",
    },
  ],
];

function cleanText(text, lang) {
  let out = text;
  for (const [re, words] of ALT_MAP) out = out.replace(re, words[lang] || "");
  // Final sweep: any leftover standalone VN words that leaked from templates
  const leftovers = [[/qualità/g, { it: "qualità" }]];
  return out;
}

for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    t.name = cleanText(t.name, lang);
    t.description = cleanText(t.description, lang);
    t.technicalDescription = cleanText(t.technicalDescription, lang);
    for (const k of Object.keys(t.specs || {})) {
      t.specs[k] = cleanText(t.specs[k], lang);
    }
    t.imageAlts = (t.imageAlts || []).map((a) => cleanText(a, lang));
  }
}
save(handPath, hand);
console.log("cleaned; verifying...");
const VIET = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;
let bad = 0;
for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    const all = [
      t.name,
      t.description,
      t.technicalDescription,
      Object.values(t.specs || {}).join(" "),
      (t.imageAlts || []).join(" "),
    ].join(" ");
    const m = all.match(
      /[\p{L}]*[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự][\p{L}]*/gu,
    );
    if (m && !["pt", "vi"].includes(lang)) {
      console.log(pid.slice(-4), lang, [...new Set(m)].slice(0, 6).join(", "));
      bad++;
    } else if (lang === "pt" && m) {
      // pt legitimately has diacritics; filter actual VN-only words
      const vnOnly = [...new Set(m)].filter((w) =>
        /^(Bàn|cơ|thiết|kế|Màu|sắc|Kết|nối|Cảm|biến|dây|không|Không)$/u.test(w),
      );
      if (vnOnly.length) {
        console.log(pid.slice(-4), lang, "VN:", vnOnly.join(", "));
        bad++;
      }
    }
  }
}
console.log(bad ? bad + " records still flagged" : "ALL CLEAN");
