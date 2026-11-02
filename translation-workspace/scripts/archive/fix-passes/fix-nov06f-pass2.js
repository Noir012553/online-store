// Fix preflight pass 2: remaining VN keys in tech JSON — extend KEY_TR with
// "Kích thước" and "Kết nối", rebuild tech for all slots using a loop.
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
};
const VAL_TR = [
  [/(\d+)\s*phím/g, { fr: "$1 touches", it: "$1 tasti" }],
  [/Không dây/g, { fr: "Sans fil", it: "Wireless" }],
  [/Có dây/g, { fr: "Filaire", it: "Cablato" }],
  [/Không\b/g, { fr: "Non", it: "No" }],
  [/Nhựa/g, { fr: "Plastique", it: "Plastica" }],
  [/Trắng/g, { fr: "Blanc", it: "Bianco" }],
  [/Đen/g, { fr: "Noir", it: "Nero" }],
  [/Hồng/g, { fr: "Rose", it: "Rosa" }],
  [/Xám/g, { fr: "Gris", it: "Grigio" }],
  [/Xám Trắng/g, { fr: "Gris Blanc", it: "Grigio Bianco" }],
  [/kết nối/gi, { fr: "connexion", it: "connessione" }],
];
function rebuildTech(lang, srcTech) {
  const pairs = [...srcTech.matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
  return (
    `${HEAD[lang]}: {` +
    pairs
      .map(([, k, v]) => {
        const kk = KEY_TR[k] ? KEY_TR[k][lang] : k;
        let vv = String(v);
        for (const [re, words] of VAL_TR)
          if (words[lang]) vv = vv.replace(re, words[lang]);
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

// verify remaining VN words in tech
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
