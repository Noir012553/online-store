// Fix pass 2 for nov06e:
//  1. Tech descriptions have Vietnamese spec values: my KEY_TR translated keys
//     but VALUES fell back (esp. c7c3 style records) — rewrite all values in
//     tech via tr() with proper per-lang map, INCLUDING values that come from
//     the source VERBATIM (like "Có dây" → "Wired/Filaire/…"). Use the same
//     VAL_TR list but force update even when tech looks unchanged.
//  2. Desc leaks: replace leftover Vietnamese words in description per lang.
//  3. Brand chips: inject AMD/Intel/NVIDIA sentences for laptops.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND_ACC = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND_ACC, "utf8"));
const SOURCES_TXT = path.join(WS, "data", "sources-for-translation-next.txt");
const txt = fs.readFileSync(SOURCES_TXT, "utf8");
const blocks = txt.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));

const HEAD = {
  en: "Specifications",
  fr: "Spécifications",
  it: "Specifiche",
  nl: "Specificaties",
  sv: "Specifikationer",
  pt: "Especificações",
  es: "Especificaciones",
  de: "Technische Daten",
};

const KEY_TR = {
  "Phương thức kết nối": {
    en: "Connection",
    fr: "Connexion",
    it: "Connessione",
    nl: "Verbinding",
    sv: "Anslutning",
    pt: "Ligação",
    es: "Conexión",
    de: "Verbindung",
  },
  "Màu sắc": {
    en: "Color",
    fr: "Couleur",
    it: "Colore",
    nl: "Kleur",
    sv: "Färg",
    pt: "Cor",
    es: "Color",
    de: "Farbe",
  },
  "Số lượng phím": {
    en: "Number of keys",
    fr: "Nombre de touches",
    it: "Numero di tasti",
    nl: "Aantal toetsen",
    sv: "Antal tangenter",
    pt: "Número de teclas",
    es: "Número de teclas",
    de: "Anzahl der Tasten",
  },
  "Kích thước\/Layout": {
    en: "Size\/Layout",
    fr: "Taille\/Layout",
    it: "Dimensione\/Layout",
    nl: "Grootte\/Layout",
    sv: "Storlek\/Layout",
    pt: "Tamanho\/Layout",
    es: "Tamaño\/Layout",
    de: "Größe\/Layout",
  },
  "Kích thước màn hình": {
    en: "Screen size",
    fr: "Taille de l'écran",
    it: "Dimensione schermo",
    nl: "Schermgrootte",
    sv: "Skärmstorlek",
    pt: "Tamanho do ecrã",
    es: "Tamaño de pantalla",
    de: "Bildschirmgröße",
  },
  "Độ phân giải": {
    en: "Resolution",
    fr: "Résolution",
    it: "Risoluzione",
    nl: "Resolutie",
    sv: "Upplösning",
    pt: "Resolução",
    es: "Resolución",
    de: "Auflösung",
  },
  "Dung lượng RAM": {
    en: "RAM capacity",
    fr: "Capacité de RAM",
    it: "Capacità RAM",
    nl: "RAM-capaciteit",
    sv: "RAM-kapacitet",
    pt: "Capacidade de RAM",
    es: "Capacidad de RAM",
    de: "RAM-Kapazität",
  },
  "Dung lượng SSD": {
    en: "SSD capacity",
    fr: "Capacité de SSD",
    it: "Capacità SSD",
    nl: "SSD-capaciteit",
    sv: "SSD-kapacitet",
    pt: "Capacidade de SSD",
    es: "Capacidad de SSD",
    de: "SSD-Kapazität",
  },
  "Dòng CPU": {
    en: "CPU series",
    fr: "Série de CPU",
    it: "Serie CPU",
    nl: "CPU-serie",
    sv: "CPU-serie",
    pt: "Série de CPU",
    es: "Serie de CPU",
    de: "CPU-Serie",
  },
  "Dòng GPU": {
    en: "GPU series",
    fr: "Série de GPU",
    it: "Serie GPU",
    nl: "GPU-serie",
    sv: "GPU-serie",
    pt: "Série de GPU",
    es: "Serie de GPU",
    de: "GPU-Serie",
  },
  "Card đồ họa": {
    en: "Graphics card",
    fr: "Carte graphique",
    it: "Scheda grafica",
    nl: "Videokaart",
    sv: "Grafikkort",
    pt: "Placa gráfica",
    es: "Tarjeta gráfica",
    de: "Grafikkarte",
  },
  "Tấm nền": {
    en: "Panel",
    fr: "Dalle",
    it: "Pannello",
    nl: "Paneel",
    sv: "Panel",
    pt: "Painel",
    es: "Panel",
    de: "Panel",
  },
  "Chất liệu Keycap": {
    en: "Keycap material",
    fr: "Matériau des keycaps",
    it: "Materiale keycap",
    nl: "Keycap-materiaal",
    sv: "Keycap-material",
    pt: "Material dos keycaps",
    es: "Material de las teclas",
    de: "Keycap-Material",
  },
  "Chất liệu vỏ": {
    en: "Shell material",
    fr: "Matériau du châssis",
    it: "Materiale del guscio",
    nl: "Behuizingsmateriaal",
    sv: "Höljesmaterial",
    pt: "Material da carcaça",
    es: "Material del chasis",
    de: "Gehäusematerial",
  },
  "Đèn LED": {
    en: "LED",
    fr: "LED",
    it: "LED",
    nl: "LED",
    sv: "LED",
    pt: "LED",
    es: "LED",
    de: "LED",
  },
  "Cảm biến": {
    en: "Sensor",
    fr: "Capteur",
    it: "Sensore",
    nl: "Sensor",
    sv: "Sensor",
    pt: "Sensor",
    es: "Sensor",
    de: "Sensor",
  },
  "Kết nối": {
    en: "Connection",
    fr: "Connexion",
    it: "Connessione",
    nl: "Verbinding",
    sv: "Anslutning",
    pt: "Ligação",
    es: "Conexión",
    de: "Verbindung",
  },
  "Trọng lượng": {
    en: "Weight",
    fr: "Poids",
    it: "Peso",
    nl: "Gewicht",
    sv: "Vikt",
    pt: "Peso",
    es: "Peso",
    de: "Gewicht",
  },
};

const VAL_TR = [
  [
    /(\d+)\s*phím/g,
    {
      en: "$1 keys",
      fr: "$1 touches",
      it: "$1 tasti",
      nl: "$1 toetsen",
      sv: "$1 tangenter",
      pt: "$1 teclas",
      es: "$1 teclas",
      de: "$1 Tasten",
    },
  ],
  [
    /Không dây/g,
    {
      en: "Wireless",
      fr: "Sans fil",
      it: "Wireless",
      nl: "Draadloos",
      sv: "Trådlös",
      pt: "Sem fios",
      es: "Inalámbrico",
      de: "Kabellos",
    },
  ],
  [
    /có dây/g,
    {
      en: "wired",
      fr: "filaire",
      it: "cablato",
      nl: "bedraad",
      sv: "trådbunden",
      pt: "com fios",
      es: "con cable",
      de: "kabelgebunden",
    },
  ],
  [
    /Có dây/g,
    {
      en: "Wired",
      fr: "Filaire",
      it: "Cablato",
      nl: "Bedraad",
      sv: "Trådbunden",
      pt: "Com fios",
      es: "Con cable",
      de: "Kabelgebunden",
    },
  ],
  [
    /Không\b/g,
    {
      en: "No",
      fr: "Non",
      it: "No",
      nl: "Nee",
      sv: "Nej",
      pt: "Não",
      es: "No",
      de: "Nein",
    },
  ],
  [
    /Nhựa/g,
    {
      en: "Plastic",
      fr: "Plastique",
      it: "Plastica",
      nl: "Kunststof",
      sv: "Plast",
      pt: "Plástico",
      es: "Plástico",
      de: "Kunststoff",
    },
  ],
  [
    /Trắng/g,
    {
      en: "White",
      fr: "Blanc",
      it: "Bianco",
      nl: "Wit",
      sv: "Vit",
      pt: "Branco",
      es: "Blanco",
      de: "Weiß",
    },
  ],
  [
    /Đen/g,
    {
      en: "Black",
      fr: "Noir",
      it: "Nero",
      nl: "Zwart",
      sv: "Svart",
      pt: "Preto",
      es: "Negro",
      de: "Schwarz",
    },
  ],
  [
    /Hồng/g,
    {
      en: "Pink",
      fr: "Rose",
      it: "Rosa",
      nl: "Roze",
      sv: "Rosa",
      pt: "Rosa",
      es: "Rosa",
      de: "Rosa",
    },
  ],
  [
    /Xám/g,
    {
      en: "Gray",
      fr: "Gris",
      it: "Grigio",
      nl: "Grijs",
      sv: "Grå",
      pt: "Cinza",
      es: "Gris",
      de: "Grau",
    },
  ],
  [
    /Xanh dương/g,
    {
      en: "Blue",
      fr: "Bleu",
      it: "Blu",
      nl: "Blauw",
      sv: "Blå",
      pt: "Azul",
      es: "Azul",
      de: "Blau",
    },
  ],
  [
    /nâu/gi,
    {
      en: "brown",
      fr: "brun",
      it: "marrone",
      nl: "bruin",
      sv: "brun",
      pt: "marrom",
      es: "marrón",
      de: "braun",
    },
  ],
];

function tr(v, lang) {
  let out = String(v);
  for (const [re, words] of VAL_TR)
    if (words[lang]) out = out.replace(re, words[lang]);
  return out;
}

const DESC_LEAK = [
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
    /không dây/gi,
    {
      en: "wireless",
      fr: "sans fil",
      it: "wireless",
      nl: "draadloos",
      sv: "trådlös",
      pt: "sem fios",
      es: "inalámbrico",
      de: "kabellos",
    },
  ],
  [
    /xanh dương/gi,
    {
      en: "blue",
      fr: "bleu",
      it: "blu",
      nl: "blauw",
      sv: "blå",
      pt: "azul",
      es: "azul",
      de: "blau",
    },
  ],
  [
    /trắng/gi,
    {
      en: "white",
      fr: "blanc",
      it: "bianco",
      nl: "wit",
      sv: "vit",
      pt: "branco",
      es: "blanco",
      de: "weiß",
    },
  ],
  [
    /đen/gi,
    {
      en: "black",
      fr: "noir",
      it: "nero",
      nl: "zwart",
      sv: "svart",
      pt: "preto",
      es: "negro",
      de: "schwarz",
    },
  ],
  [
    /hồng/gi,
    {
      en: "pink",
      fr: "rose",
      it: "rosa",
      nl: "roze",
      sv: "rosa",
      pt: "rosa",
      es: "rosa",
      de: "rosa",
    },
  ],
  [
    /tím/gi,
    {
      en: "purple",
      fr: "violet",
      it: "viola",
      nl: "paars",
      sv: "lila",
      pt: "roxo",
      es: "morado",
      de: "lila",
    },
  ],
  [
    /chính hãng/gi,
    {
      en: "genuine",
      fr: "authentique",
      it: "originale",
      nl: "origineel",
      sv: "original",
      pt: "original",
      es: "original",
      de: "original",
    },
  ],
];

const CHIP_SENT = {
  "c610/fr AMD": (n) =>
    `La plateforme AMD Ryzen à l'intérieur du ${n} garantit des performances stables sur le long terme.`,
  "c697/fr AMD+NVIDIA": (n) =>
    `L'ASUS TUF Gaming FA401UH-RG001W combine AMD Ryzen 7 260 avec une NVIDIA GeForce RTX 5050, RAM 16GB et SSD 512GB dans un format TUF Gaming A14 de 14 pouces.`,
  "c69e/fr Intel+NVIDIA": (n) =>
    `L'ASUS ROG Zephyrus GU405AR-SY016W embarque Intel Core Ultra 9 386H, NVIDIA GeForce RTX 5070 Ti 12GB GDDR7, RAM 32GB et SSD 1TB PCIe 4.0.`,
  "c69f/fr Intel+NVIDIA": (n) =>
    `La machine utilise Intel Core Ultra 9 386H et NVIDIA GeForce RTX 5080 16GB GDDR7, avec RAM 32GB LPDDR5X-8533 et SSD 1TB PCIe 4.0.`,
  "c6a3/nl AMD+NVIDIA": (n) =>
    `De ASUS TUF Gaming A14 FA401GM RG013W gebruikt de NVIDIA GeForce RTX 5060 8GB GDDR7 grafische kaart en een AMD processor voor stabiele gaming prestaties.`,
};

const FIXED_DESC_KEYS = [
  "c705:it",
  "c705:es",
  "c707:fr",
  "c721:en",
  "c723:en",
  "c727:en",
  "c727:fr",
  "c75b:en",
  "c75f:en",
  "c75f:fr",
];

// Build full pid keys from tails
const idByTailLang = {};
for (const pid of Object.keys(hand)) {
  for (const lang of Object.keys(hand[pid])) {
    idByTailLang[pid.slice(-4) + ":" + lang] = pid;
  }
}

let n = 0;
for (const tailLang of FIXED_DESC_KEYS) {
  const [tail, lang] = tailLang.split(":");
  const pid = idByTailLang[tailLang];
  if (!pid) continue;
  const t = hand[pid][lang];
  // 2. desc leak fix: apply DESC_LEAK globally
  let desc = t.description || "";
  for (const [re, words] of DESC_LEAK)
    desc = desc.replace(re, words[lang] || "");
  t.description = desc;
  n++;
}
console.log("desc cleaned:", n);

// Rewrite tech-JSON for all records: keys via KEY_TR, values via tr()
let techFixed = 0;
for (const pid of Object.keys(hand)) {
  const block = blockByPid.get(pid);
  if (!block) continue;
  const techMatch = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
  if (!techMatch) continue;
  for (const lang of Object.keys(hand[pid])) {
    const pairs = [...techMatch[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
    const tech =
      `${HEAD[lang]}: {` +
      pairs
        .map(
          ([, k, v]) =>
            `"${KEY_TR[k] ? KEY_TR[k][lang] : k}": "${tr(v, lang)}"`,
        )
        .join(", ") +
      "}";
    if (hand[pid][lang].technicalDescription !== tech) {
      hand[pid][lang].technicalDescription = tech;
      techFixed++;
    }
  }
}
console.log("tech rewritten:", techFixed);

// 3. brand chip sentences for the 5 flagged records
for (const key of Object.keys(CHIP_SENT)) {
  const [tail, lang] = key.split(" ");
  const pid = idByTailLang[tail + ":" + lang];
  if (!pid) continue;
  const t = hand[pid][lang];
  const prodName = (t.name || "").replace(
    /^(Clavier sans fil |Souris sans fil |PC portable gaming |PC portable |Laptop |Portátil gaming )/,
    "",
  );
  const sentence = CHIP_SENT[key](prodName);
  const firstBreak = t.description.indexOf("\n\n");
  const secondBreak = t.description.indexOf("\n\n", firstBreak + 2);
  if (secondBreak < 0) continue;
  t.description =
    t.description.slice(0, secondBreak) +
    "\n\n" +
    sentence +
    t.description.slice(secondBreak);
}

fs.writeFileSync(HAND_ACC, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass2 done");
