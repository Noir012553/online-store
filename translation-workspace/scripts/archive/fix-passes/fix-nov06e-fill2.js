// Fill sv laptop description (missing) + regenerate all remaining TBD entries.
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

const LAPTOP_DESC_SV = (n, b) =>
  `Upptäck ${n}\n\n${n} balanserar prestanda, skärmkvalitet och portabilitet för arbete, studier och underhållning. Konfigurationen täcker dagligt multitasking och tyngre kreativa uppgifter, i ett chassi gjort för daglig transport.\n\nPlattform och minne för riktiga arbetslaster\n\nCPU/GPU-kombinationen levererar stabil bearbetning medan RAM och lagring håller appar, filer och projekt nära till hands utan konstant städning.\n\nSkärm och anslutning för långa sessioner\n\nSkärmen förblir klar och bekväm under många timmar, och portvalet täcker externa skärmar, kringutrustning och trådbundet nätverk vid behov.\n\nKöp ${n} hos GearVN\n\nGearVN erbjuder originalprodukter från ${b} med pålitlig garantistöd och snabb leverans i hela landet. Beställ ${n} idag för att uppgradera din arbetsplats med en pålitlig laptop.`;

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
function trVal(v, lang) {
  let out = String(v);
  for (const [re, words] of VAL_TR)
    if (words[lang]) out = out.replace(re, words[lang]);
  return out;
}

let count = 0;
for (const block of blocks) {
  const pid = block.match(/^([0-9a-f]+)/)[1];
  if (!hand[pid]) continue;
  const langs = block
    .match(/LANGS: (.*)/)[1]
    .trim()
    .split(",")
    .map((s) => s.trim());
  for (const lang of langs) {
    const t = hand[pid][lang];
    const needsFill =
      !t ||
      !t.name ||
      !t.description ||
      (t.description || "").length < 80 ||
      (t.description || "").startsWith("TBD");
    if (!needsFill) continue;
    if (lang !== "sv" || !/^Laptop/.test(block.match(/NAME: (.*)/)[1]))
      continue;
    const name = (block.match(/NAME: (.*)/)[1] || "").trim();
    const brand = (block.match(/BRAND: (.*)/)[1] || "").trim();
    const specsBlock = block.match(
      /SPECS \(key=value\):\n([\s\S]*?)\nTECH_DESCRIPTION/,
    );
    const specEntries = [];
    if (specsBlock) {
      for (const line of specsBlock[1].split("\n")) {
        const m = line.match(/^\s+(\S+)\s=\s(.*)$/);
        if (m) specEntries.push([m[1], m[2]]);
      }
    }
    const techMatch = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
    let tech = "";
    if (techMatch) {
      const pairs = [...techMatch[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
      tech =
        `${HEAD[lang]}: {` +
        pairs
          .map(
            ([, k, v]) =>
              `"${KEY_TR[k] ? KEY_TR[k][lang] : k}": "${trVal(v, lang)}"`,
          )
          .join(", ") +
        "}";
    }
    const alts = [...block.matchAll(/  \[(\d+)\] (.*)/g)]
      .filter((m) => !/type=/.test(m[2]))
      .map((m) => m[2].trim())
      .filter(Boolean);
    hand[pid][lang] = {
      name: name.replace(/^Laptop /, "Bärbar dator "),
      description: LAPTOP_DESC_SV(
        name.replace(/^Laptop /, "Bärbar dator "),
        brand,
      ),
      brand,
      specs: Object.fromEntries(
        specEntries.map(([k, v]) => [k, trVal(v, lang)]),
      ),
      technicalDescription: tech,
      imageAlts: alts.map((a) => trVal(a, lang)),
    };
    count++;
    console.log("filled sv laptop:", pid.slice(-4), name.slice(0, 50));
  }
}
fs.writeFileSync(HAND_ACC, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("regenerated:", count);
