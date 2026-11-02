// Fix pass 19 — remaining leaks in nov06f:
//  c8a2/it  leak "ro it red" from name token in desc: "M650 Rose" adjacent "di Logitech" pattern.
//    Fix: drop the "di Logitech" mention or swap to "Logitech M650".
//  c921/fr  leak "độ phân giải" in tech — the source key "Độ phân giải" wasn't
//    translated because KEY_TR lacked this entry — rebuild tech c921/fr.
//  c921/pt  same
//  c921/it  same
//  c929/fr, c929/it, c929/nl same — laptop specs "Độ phân giải".
// Rewrite tech for these laptop records with proper key/value translation.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const SRC = path.join(WS, "data", "export", "assistant-batch-next.json");
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const srcData = JSON.parse(fs.readFileSync(SRC, "utf8"));
const srcByPid = new Map(srcData.records.map((r) => [r.productId, r]));

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

function rebuildTech(lang, srcTech) {
  const pairs = [...srcTech.matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
  const obj = pairs
    .map(([, k, v]) => {
      let kk = KEY_TR[k] ? KEY_TR[k][lang] : k;
      let vv = String(v);
      // value-side: "phím" counters
      vv = vv.replace(
        /(\d+)\s*phím/gi,
        (m, n) =>
          `${n} ` +
          {
            en: "keys",
            fr: "touches",
            it: "tasti",
            nl: "toetsen",
            sv: "tangenter",
            pt: "teclas",
            es: "teclas",
            de: "Tasten",
          }[lang],
      );
      // color words
      for (const [re, w] of [
        [
          /Trắng/gi,
          {
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
          /Xanh dương/gi,
          {
            fr: "Bleu",
            it: "Blu",
            nl: "Blauw",
            sv: "Blå",
            pt: "Azul",
            es: "Azul",
            de: "Blau",
          },
        ],
      ]) {
        if (w[lang]) vv = vv.replace(re, w[lang]);
      }
      return `"${kk}": "${vv}"`;
    })
    .join(", ");
  return `${HEAD[lang]}: {${obj}}`;
}

const TARGETS = [
  ["c921", "fr"],
  ["c921", "pt"],
  ["c921", "it"],
  ["c929", "fr"],
  ["c929", "it"],
  ["c929", "nl"],
];
for (const [tail, lang] of TARGETS) {
  const pid = Object.keys(hand).find((k) => k.endsWith(tail));
  if (!pid) {
    console.log("miss", tail);
    continue;
  }
  if (!hand[pid][lang]) {
    console.log("no lang entry", tail, lang, "— creating");
    hand[pid][lang] = { name: "", description: "", brand: "", specs: {}, technicalDescription: "", imageAlts: [] };
  }
  const srcRec = srcByPid.get(pid);
  const tm = srcRec.source.technicalDescription;
  const newTech = rebuildTech(lang, tm);
  hand[pid][lang].technicalDescription = newTech;
  const rec = d.records.find(
    (r) => r.productId === pid && r.targetLang === lang,
  );
  if (rec) rec.translations.technicalDescription = newTech;
  console.log(tail + "/" + lang, "->", newTech.slice(0, 90));
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
console.log("pass19 done");
