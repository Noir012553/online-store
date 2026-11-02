// Fix nov06d tech-JSON labels: my generator left Vietnamese KEYS
// (e.g. "Phương thức kết nối", "Màu sắc", "Kích thước", "Dung lượng RAM")
// untranslated. Translate the keys, not just values, per-language.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const KEY_MAP = [
  [
    /Phương thức kết nối/g,
    {
      en: "Connection",
      pt: "Método de ligação",
      fr: "Méthode de connexion",
      de: "Verbindungsmethode",
      it: "Metodo di connessione",
      es: "Método de conexión",
      nl: "Verbindingsmethode",
      sv: "Anslutningsmetod",
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
    /Kích thước màn hình/g,
    {
      en: "Screen size",
      pt: "Tamanho do ecrã",
      fr: "Taille de l'écran",
      de: "Bildschirmgröße",
      it: "Dimensione schermo",
      es: "Tamaño de pantalla",
      nl: "Schermgrootte",
      sv: "Skärmstorlek",
    },
  ],
  [
    /Kích thước\/Layout/g,
    {
      en: "Size/Layout",
      pt: "Tamanho/Layout",
      fr: "Taille/Layout",
      de: "Größe/Layout",
      it: "Dimensione/Layout",
      es: "Tamaño/Layout",
      nl: "Grootte/Layout",
      sv: "Storlek/Layout",
    },
  ],
  [
    /Kích thước/g,
    {
      en: "Size",
      pt: "Tamanho",
      fr: "Taille",
      de: "Größe",
      it: "Dimensione",
      es: "Tamaño",
      nl: "Grootte",
      sv: "Storlek",
    },
  ],
  [
    /Dung lượng RAM/g,
    {
      en: "RAM capacity",
      pt: "Capacidade de RAM",
      fr: "Capacité de RAM",
      de: "RAM-Kapazität",
      it: "Capacità RAM",
      es: "Capacidad de RAM",
      nl: "RAM-capaciteit",
      sv: "RAM-kapacitet",
    },
  ],
  [
    /Dung lượng SSD/g,
    {
      en: "SSD capacity",
      pt: "Capacidade de SSD",
      fr: "Capacité de SSD",
      de: "SSD-Kapazität",
      it: "Capacità SSD",
      es: "Capacidad de SSD",
      nl: "SSD-capaciteit",
      sv: "SSD-kapacitet",
    },
  ],
  [
    /Dòng CPU/g,
    {
      en: "CPU series",
      pt: "Série de CPU",
      fr: "Série de CPU",
      de: "CPU-Serie",
      it: "Serie CPU",
      es: "Serie de CPU",
      nl: "CPU-serie",
      sv: "CPU-serie",
    },
  ],
  [
    /Dòng GPU/g,
    {
      en: "GPU series",
      pt: "Série de GPU",
      fr: "Série de GPU",
      de: "GPU-Serie",
      it: "Serie GPU",
      es: "Serie de GPU",
      nl: "GPU-serie",
      sv: "GPU-serie",
    },
  ],
  [
    /Card đồ họa/g,
    {
      en: "Graphics card",
      pt: "Placa gráfica",
      fr: "Carte graphique",
      de: "Grafikkarte",
      it: "Scheda grafica",
      es: "Tarjeta gráfica",
      nl: "Videokaart",
      sv: "Grafikkort",
    },
  ],
  [
    /Tấm nền/g,
    {
      en: "Panel",
      pt: "Painel",
      fr: "Dalle",
      de: "Panel",
      it: "Pannello",
      es: "Panel",
      nl: "Paneel",
      sv: "Panel",
    },
  ],
  [
    /Độ phân giải/g,
    {
      en: "Resolution",
      pt: "Resolução",
      fr: "Résolution",
      de: "Auflösung",
      it: "Risoluzione",
      es: "Resolución",
      nl: "Resolutie",
      sv: "Upplösning",
    },
  ],
  [
    /Chất liệu Keycap/g,
    {
      en: "Keycap material",
      pt: "Material dos keycaps",
      fr: "Matériau des keycaps",
      de: "Keycap-Material",
      it: "Materiale keycap",
      es: "Material de las teclas",
      nl: "Keycap-materiaal",
      sv: "Keycap-material",
    },
  ],
  [
    /Chất liệu vỏ/g,
    {
      en: "Shell material",
      pt: "Material da carcaça",
      fr: "Matériau du châssis",
      de: "Gehäusematerial",
      it: "Materiale del guscio",
      es: "Material del chasis",
      nl: "Behuizingsmateriaal",
      sv: "Höljesmaterial",
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
    /Số lượng phím/g,
    {
      en: "Number of keys",
      pt: "Número de teclas",
      fr: "Nombre de touches",
      de: "Anzahl der Tasten",
      it: "Numero di tasti",
      es: "Número de teclas",
      nl: "Aantal toetsen",
      sv: "Antal tangenter",
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
    /Độ dài cáp/g,
    {
      en: "Cable length",
      pt: "Comprimento do cabo",
      fr: "Longueur du câble",
      de: "Kabellänge",
      it: "Lunghezza cavo",
      es: "Longitud del cable",
      nl: "Kabellengte",
      sv: "Kabellängd",
    },
  ],
  [
    /Trọng lượng/g,
    {
      en: "Weight",
      pt: "Peso",
      fr: "Poids",
      de: "Gewicht",
      it: "Peso",
      es: "Peso",
      nl: "Gewicht",
      sv: "Vikt",
    },
  ],
];

const VALUE_MAP = [
  [
    / gaming không dây /g,
    {
      pt: " gaming sem fios ",
      fr: " gaming sans fil ",
      de: " Gaming kabellos ",
      it: " gaming wireless ",
      es: " gaming inalámbrico ",
      nl: " gaming draadloos ",
      sv: " gaming trådlös ",
    },
  ],
  [
    / không dây /g,
    {
      pt: " sem fios ",
      fr: " sans fil ",
      de: " kabellos ",
      it: " wireless ",
      es: " inalámbrico ",
      nl: " draadloos ",
      sv: " trådlös ",
    },
  ],
  [
    / có dây /g,
    {
      pt: " com fios ",
      fr: " filaire ",
      de: " kabelgebunden ",
      it: " cablato ",
      es: " con cable ",
      nl: " bedraad ",
      sv: " trådbunden ",
    },
  ],
  [
    / mini không dây /g,
    {
      pt: " mini sem fios ",
      fr: " mini sans fil ",
      de: " Mini kabellos ",
      it: " mini wireless ",
      es: " mini inalámbrico ",
      nl: " mini draadloos ",
      sv: " mini trådlös ",
    },
  ],
  [
    / Xám Trắng/g,
    {
      pt: " Cinza Branco",
      fr: " Gris Blanc",
      de: " Grau Weiß",
      it: " Grigio Bianco",
      es: " Gris Blanco",
      nl: " Grijs Wit",
      sv: " Grå Vit",
    },
  ],
  [
    /Xám Trắng/g,
    {
      pt: "Cinza Branco",
      fr: "Gris Blanc",
      de: "Grau Weiß",
      it: "Grigio Bianco",
      es: "Gris Blanco",
      nl: "Grijs Wit",
      sv: "Grå Vit",
    },
  ],
];

// Apply per-record (skip pt since name for c88e/pt had VN words? Actually pt is fine;
// the flagged ones are name/tech in non-pt languages. Apply all fixes for every lang.)
for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    let tech = t.technicalDescription || "";
    for (const [re, words] of KEY_MAP) {
      tech = tech.replace(re, words[lang] || "");
    }
    t.technicalDescription = tech;
    // name fixes (only languages whose name leaked VN words)
    let name = t.name || "";
    for (const [re, words] of VALUE_MAP) {
      if (lang === "en") continue; // en names didn't leak
      name = name.replace(re, words[lang] || "");
    }
    t.name = name;
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("key/value translation fixed; re-verifying...");
