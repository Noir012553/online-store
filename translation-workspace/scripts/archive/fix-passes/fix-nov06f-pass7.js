// Fix pass 6b — restore KEY_TR map in FINAL_VAL-like tech key translation.
// This rebuilds tech with correct key translations AND value translations.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
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

const KEY_MAP = {
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
  "Kích thước": {
    en: "Size",
    fr: "Taille",
    it: "Dimensione",
    nl: "Grootte",
    sv: "Storlek",
    pt: "Tamanho",
    es: "Tamaño",
    de: "Größe",
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
  "Kiểu tai nghe": {
    en: "Earbud type",
    fr: "Type d'écouteurs",
    it: "Tipo di auricolari",
    nl: "Oortelefoon-type",
    sv: "Hörlurstyp",
    pt: "Tipo de auscultadores",
    es: "Tipo de auriculares",
    de: "Kopfhörertyp",
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
};

const KEY_CASE_INSENSITIVE_VAL_TR = [
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
    /cảm biến/gi,
    {
      en: "Sensor",
      fr: "Capteur",
      it: "Sensore",
      nl: "Sensor",
      sv: "Sensor",
      pt: "Sensor",
      es: "Sensor",
      de: "Sensor",
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
];

function mapTech(lang, srcTech) {
  const pairs = [...srcTech.matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
  const list = pairs.map(([, k, v]) => {
    let kk = KEY_MAP[k] ? KEY_MAP[k][lang] : k;
    let vv = String(v);
    if (!KEY_MAP[k]) {
      // also apply case-insensitive key translation in value fields that may
      // hold VN labels
      for (const [re, words] of KEY_CASE_INSENSITIVE_VAL_TR) {
        if (words[lang]) vv = vv.replace(re, words[lang]);
      }
    }
    return `"${kk}": "${vv}"`;
  });
  return `${HEAD[lang]}: {` + list.join(", ") + "}";
}

let rebuilt = 0;
for (const rec of importData.records) {
  const pid = rec.productId,
    lang = rec.targetLang;
  const block = blockByPid.get(pid);
  if (!block) continue;
  const tm = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
  if (!tm) continue;
  const newTech = mapTech(lang, tm[1]);
  rec.translations.technicalDescription = newTech;
  if (hand[pid] && hand[pid][lang])
    hand[pid][lang].technicalDescription = newTech;
  rebuilt++;
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
fs.writeFileSync(IMPORT, JSON.stringify(importData, null, 2), "utf8");
console.log("rebuilt:", rebuilt);
