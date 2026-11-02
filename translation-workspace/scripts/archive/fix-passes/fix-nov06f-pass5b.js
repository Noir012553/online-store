// Fix pass 5b: extended GLOBAL_TR list (all remaining VN words in tech JSON)
// — rebuild tech for all nov06f records and verify tech leaks again.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const SOURCES = fs.readFileSync(
  path.join(WS, "data", "sources-for-translation-next.txt"),
  "utf8",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const blocks = SOURCES.split("===== PRODUCT ").slice(1);
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

const GLOBAL_TR = [
  [
    /trọng lượng/gi,
    {
      en: "Weight",
      fr: "Poids",
      it: "Peso",
      nl: "Gewicht",
      sv: "Vikt",
      pt: "Peso",
      es: "Peso",
      de: "Gewicht",
    },
  ],
  [
    /hợp kim nhôm/gi,
    {
      en: "Aluminum alloy",
      fr: "Alliage d'aluminium",
      it: "Lega di alluminio",
      nl: "Aluminium legering",
      sv: "Aluminiumlegering",
      pt: "Liga de alumínio",
      es: "Aleación de aluminio",
      de: "Aluminiumlegierung",
    },
  ],
  [
    /loại pin/gi,
    {
      en: "Battery type",
      fr: "Type de pile",
      it: "Tipo di batteria",
      nl: "Batterijtype",
      sv: "Batterityp",
      pt: "Tipo de bateria",
      es: "Tipo de batería",
      de: "Batterietyp",
    },
  ],
  [
    /kim loại/gi,
    {
      en: "Metal",
      fr: "Métal",
      it: "Metallo",
      nl: "Metaal",
      sv: "Metall",
      pt: "Metal",
      es: "Metal",
      de: "Metall",
    },
  ],
  [
    /cầu vòng/gi,
    {
      en: "Arc curve",
      fr: "Courbe en arc",
      it: "Curva ad arco",
      nl: "Boog curve",
      sv: "Bågkurva",
      pt: "Curva em arco",
      es: "Curva en arco",
      de: "Bogenkurve",
    },
  ],
  [
    /cổng usb/gi,
    {
      en: "USB port",
      fr: "Port USB",
      it: "Porta USB",
      nl: "USB-poort",
      sv: "USB-port",
      pt: "Porta USB",
      es: "Puerto USB",
      de: "USB-Anschluss",
    },
  ],
  [
    /kích thước\/layout/gi,
    {
      en: "Size\/Layout",
      fr: "Taille\/Layout",
      it: "Dimensione\/Layout",
      nl: "Grootte\/Layout",
      sv: "Storlek\/Layout",
      pt: "Tamanho\/Layout",
      es: "Tamaño\/Layout",
      de: "Größe\/Layout",
    },
  ],
  [
    /kích thước màn hình/gi,
    {
      en: "Screen size",
      fr: "Taille de l'écran",
      it: "Dimensione schermo",
      nl: "Schermgrootte",
      sv: "Skärmstorlek",
      pt: "Tamanho do ecrã",
      es: "Tamaño de pantalla",
      de: "Bildschirmgröße",
    },
  ],
  [
    /card đồ họa/gi,
    {
      en: "Graphics card",
      fr: "Carte graphique",
      it: "Scheda grafica",
      nl: "Videokaart",
      sv: "Grafikkort",
      pt: "Placa gráfica",
      es: "Tarjeta gráfica",
      de: "Grafikkarte",
    },
  ],
  [
    /dung lượng ram/gi,
    {
      en: "RAM capacity",
      fr: "Capacité de RAM",
      it: "Capacità RAM",
      nl: "RAM-capaciteit",
      sv: "RAM-kapacitet",
      pt: "Capacidade de RAM",
      es: "Capacidad de RAM",
      de: "RAM-Kapazität",
    },
  ],
  [
    /dung lượng ssd/gi,
    {
      en: "SSD capacity",
      fr: "Capacité de SSD",
      it: "Capacità SSD",
      nl: "SSD-capaciteit",
      sv: "SSD-kapacitet",
      pt: "Capacidade de SSD",
      es: "Capacidad de SSD",
      de: "SSD-Kapazität",
    },
  ],
  [
    /màu sắc/gi,
    {
      en: "Color",
      fr: "Couleur",
      it: "Colore",
      nl: "Kleur",
      sv: "Färg",
      pt: "Cor",
      es: "Color",
      de: "Farbe",
    },
  ],
  [
    /phương thức kết nối/gi,
    {
      en: "Connection",
      fr: "Connexion",
      it: "Connessione",
      nl: "Verbinding",
      sv: "Anslutning",
      pt: "Ligação",
      es: "Conexión",
      de: "Verbindung",
    },
  ],
  [
    /dòng cpu/gi,
    {
      en: "CPU series",
      fr: "Série de CPU",
      it: "Serie CPU",
      nl: "CPU-serie",
      sv: "CPU-serie",
      pt: "Série de CPU",
      es: "Serie de CPU",
      de: "CPU-Serie",
    },
  ],
  [
    /dòng gpu/gi,
    {
      en: "GPU series",
      fr: "Série de GPU",
      it: "Serie GPU",
      nl: "GPU-serie",
      sv: "GPU-serie",
      pt: "Série de GPU",
      es: "Serie de GPU",
      de: "GPU-Serie",
    },
  ],
  [
    /tấm nền/gi,
    {
      en: "Panel",
      fr: "Dalle",
      it: "Pannello",
      nl: "Paneel",
      sv: "Panel",
      pt: "Painel",
      es: "Panel",
      de: "Panel",
    },
  ],
  [
    /độ phân giải/gi,
    {
      en: "Resolution",
      fr: "Résolution",
      it: "Risoluzione",
      nl: "Resolutie",
      sv: "Upplösning",
      pt: "Resolução",
      es: "Resolución",
      de: "Auflösung",
    },
  ],
  [
    /chất liệu keycap/gi,
    {
      en: "Keycap material",
      fr: "Matériau des keycaps",
      it: "Materiale keycap",
      nl: "Keycap-materiaal",
      sv: "Keycap-material",
      pt: "Material dos keycaps",
      es: "Material de las teclas",
      de: "Keycap-Material",
    },
  ],
  [
    /chất liệu vỏ/gi,
    {
      en: "Shell material",
      fr: "Matériau du châssis",
      it: "Materiale del guscio",
      nl: "Behuizingsmateriaal",
      sv: "Höljesmaterial",
      pt: "Material da carcaça",
      es: "Material del chasis",
      de: "Gehäusematerial",
    },
  ],
  [
    /đèn led/gi,
    {
      en: "LED",
      fr: "LED",
      it: "LED",
      nl: "LED",
      sv: "LED",
      pt: "LED",
      es: "LED",
      de: "LED",
    },
  ],
  [
    /kiểu tai nghe/gi,
    {
      en: "Earbud type",
      fr: "Type d'écouteurs",
      it: "Tipo di auricolari",
      nl: "Oortelefoon-type",
      sv: "Hörlurstyp",
      pt: "Tipo de auscultadores",
      es: "Tipo de auriculares",
      de: "Kopfhörertyp",
    },
  ],
  [
    /kích thước/gi,
    {
      en: "Size",
      fr: "Taille",
      it: "Dimensione",
      nl: "Grootte",
      sv: "Storlek",
      pt: "Tamanho",
      es: "Tamaño",
      de: "Größe",
    },
  ],
  [
    /kết nối/gi,
    {
      en: "Connection",
      fr: "Connexion",
      it: "Connessione",
      nl: "Verbinding",
      sv: "Anslutning",
      pt: "Ligação",
      es: "Conexión",
      de: "Verbindung",
    },
  ],
  [
    /số lượng phím/gi,
    {
      en: "Number of keys",
      fr: "Nombre de touches",
      it: "Numero di tasti",
      nl: "Aantal toetsen",
      sv: "Antal tangenter",
      pt: "Número de teclas",
      es: "Número de teclas",
      de: "Anzahl der Tasten",
    },
  ],
  [
    /(\d+)\s*phím/gi,
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
    /Không dây/gi,
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
    /Có dây/gi,
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
    /Nhựa/gi,
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
    /Trắng/gi,
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
    /Đen/gi,
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
    /Hồng/gi,
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
    /Xám/gi,
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
];

function rebuildTech(lang, srcTech) {
  const pairs = [...srcTech.matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
  return (
    `${HEAD[lang]}: {` +
    pairs
      .map(([, k, v]) => {
        let kk = k,
          vv = v;
        for (const [re, words] of GLOBAL_TR) {
          if (words[lang]) {
            kk = kk.replace(re, words[lang]);
            vv = vv.replace(re, words[lang]);
          }
        }
        return `"${kk}": "${vv}"`;
      })
      .join(", ") +
    "}"
  );
}

let rebuilt = 0;
for (const rec of importData.records) {
  const pid = rec.productId,
    lang = rec.targetLang;
  const block = blockByPid.get(pid);
  if (!block) continue;
  const tm = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
  if (!tm) continue;
  const newTech = rebuildTech(lang, tm[1]);
  if (hand[pid] && hand[pid][lang])
    hand[pid][lang].technicalDescription = newTech;
  rec.translations.technicalDescription = newTech;
  rebuilt++;
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
fs.writeFileSync(IMPORT, JSON.stringify(importData, null, 2), "utf8");
console.log("tech rebuilt for", rebuilt, "records");

let leftovers = 0;
for (const rec of importData.records) {
  const t = rec.translations.technicalDescription || "";
  const wl = validator.checkSourceLanguageLeak(
    rec.source.technicalDescription,
    t,
    rec.targetLang,
    "product_technical_description",
  );
  if (wl) {
    leftovers++;
    console.log(
      rec.productId.slice(-4) + "/" + rec.targetLang,
      "leak:",
      wl.phrase,
    );
  }
}
console.log("remaining tech leaks:", leftovers);
