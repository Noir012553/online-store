// Fix pass 5c: case-sensitive fixed — the GLOBAL_TR had "/kích thước\/layout/gi"
// but the leak-list didn't include kích thước/layout; the leak words here are
// "cảm biến" (Sensor) and "tương thích" (Compatible) which ARE in the list but
// list is ordered alphabetically and later rules overwrite earlier... Actually
// the issue is that our GLOBAL_TR applies pairs — the sensor entries for
// c8a2/c921 etc. should be handled — but "Cảm biến" in original source is a
// case-variant (e.g. "cảm biến" lowercase) matched by /gi... Let me check:
// maybe some records source tech JSON was written with different key like
// "Tương thích". Actually simplest — add DIRECT substring replacements after
// GLOBAL_TR rebuild:
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(path.join(BACKEND, "src", "utils", "translationValidator.js"));
const SOURCES = fs.readFileSync(path.join(WS, "data", "sources-for-translation-next.txt"), "utf8");
const HAND = path.join(WS, "data", "translations", "translations-nov06f-hand.json");
const IMPORT = path.join(WS, "data", "import", "assistant-batch-import-nov06f.json");
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const blocks = SOURCES.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));

const HEAD = { en: "Specifications", fr: "Spécifications", it: "Specifiche", nl: "Specificaties", sv: "Specifikationer", pt: "Especificações", es: "Especificaciones", de: "Technische Daten" };

// Case-sensitive + insensitive replacement of every VN word in the raw tech JSON
const SUBS = [
  [/Cảm biến/g, { en: "Sensor", fr: "Capteur", it: "Sensore", nl: "Sensor", sv: "Sensor", pt: "Sensor", es: "Sensor", de: "Sensor" }],
  [/cảm biến/g, { en: "sensor", fr: "capteur", it: "sensore", nl: "sensor", sv: "sensor", pt: "sensor", es: "sensor", de: "Sensor" }],
  [/Tương thích/g, { en: "Compatible", fr: "Compatible", it: "Compatibile", nl: "Compatibel", sv: "Kompatibel", pt: "Compatível", es: "Compatible", de: "Kompatibel" }],
  [/tương thích/g, { en: "compatible", fr: "compatible", it: "compatibile", nl: "compatibel", sv: "kompatibel", pt: "compatível", es: "compatible", de: "kompatibel" }],
  [/Trọng lượng/g, { en: "Weight", fr: "Poids", it: "Peso", nl: "Gewicht", sv: "Vikt", pt: "Peso", es: "Peso", de: "Gewicht" }],
  [/Hợp kim nhôm/g, { en: "Aluminum alloy", fr: "Alliage d'aluminium", it: "Lega di alluminio", nl: "Aluminium legering", sv: "Aluminiumlegering", pt: "Liga de alumínio", es: "Aleación de aluminio", de: "Aluminiumlegierung" }],
  [/Loại pin/g, { en: "Battery type", fr: "Type de pile", it: "Tipo di batteria", nl: "Batterijtype", sv: "Batterityp", pt: "Tipo de bateria", es: "Tipo de batería", de: "Batterietyp" }],
  [/Kim loại/g, { en: "Metal", fr: "Métal", it: "Metallo", nl: "Metaal", sv: "Metall", pt: "Metal", es: "Metal", de: "Metall" }],
  [/Cầu vòng/g, { en: "Arc curve", fr: "Courbe en arc", it: "Curva ad arco", nl: "Boog curve", sv: "Bågkurva", pt: "Curva em arco", es: "Curva en arco", de: "Bogenkurve" }],
  [/Cổng USB/g, { en: "USB port", fr: "Port USB", it: "Porta USB", nl: "USB-poort", sv: "USB-port", pt: "Porta USB", es: "Puerto USB", de: "USB-Anschluss" }],
  [/Phương thức kết nối/g, { en: "Connection", fr: "Connexion", it: "Connessione", nl: "Verbinding", sv: "Anslutning", pt: "Ligação", es: "Conexión", de: "Verbindung" }],
  [/Kích thước\/Layout/g, { en: "Size\/Layout", fr: "Taille\/Layout", it: "Dimensione\/Layout", nl: "Grootte\/Layout", sv: "Storlek\/Layout", pt: "Tamanho\/Layout", es: "Tamaño\/Layout", de: "Größe\/Layout" }],
  [/Kích thước màn hình/g, { en: "Screen size", fr: "Taille de l'écran", it: "Dimensione schermo", nl: "Schermgrootte", sv: "Skärmstorlek", pt: "Tamanho do ecrã", es: "Tamaño de pantalla", de: "Bildschirmgröße" }],
  [/Màu sắc/g, { en: "Color", fr: "Couleur", it: "Colore", nl: "Kleur", sv: "Färg", pt: "Cor", es: "Color", de: "Farbe" }],
  [/Số lượng phím/g, { en: "Number of keys", fr: "Nombre de touches", it: "Numero di tasti", nl: "Aantal toetsen", sv: "Antal tangenter", pt: "Número de teclas", es: "Número de teclas", de: "Anzahl der Tasten" }],
  [/Chất liệu Keycap/g, { en: "Keycap material", fr: "Matériau des keycaps", it: "Materiale keycap", nl: "Keycap-materiaal", sv: "Keycap-material", pt: "Material dos keycaps", es: "Material de las teclas", de: "Keycap-Material" }],
  [/Chất liệu vỏ/g, { en: "Shell material", fr: "Matériau du châssis", it: "Materiale del guscio", nl: "Behuizingsmateriaal", sv: "Höljesmaterial", pt: "Material da carcaça", es: "Material del chasis", de: "Gehäusematerial" }],
  [/Đèn LED/g, { en: "LED", fr: "LED", it: "LED", nl: "LED", sv: "LED", pt: "LED", es: "LED", de: "LED" }],
  [/Độ phân giải/g, { en: "Resolution", fr: "Résolution", it: "Risoluzione", nl: "Resolutie", sv: "Upplösning", pt: "Resolução", es: "Resolución", de: "Auflösung" }],
  [/Dung lượng RAM/g, { en: "RAM capacity", fr: "Capacité de RAM", it: "Capacità RAM", nl: "RAM-capaciteit", sv: "RAM-kapacitet", pt: "Capacidade de RAM", es: "Capacidad de RAM", de: "RAM-Kapazität" }],
  [/Dung lượng SSD/g, { en: "SSD capacity", fr: "Capacité de SSD", it: "Capacità SSD", nl: "SSD-capaciteit", sv: "SSD-kapacitet", pt: "Capacidade de SSD", es: "Capacidad de SSD", de: "SSD-Kapazität" }],
  [/Dòng CPU/g, { en: "CPU series", fr: "Série de CPU", it: "Serie CPU", nl: "CPU-serie", sv: "CPU-serie", pt: "Série de CPU", es: "Serie de CPU", de: "CPU-Serie" }],
  [/Dòng GPU/g, { en: "GPU series", fr: "Série de GPU", it: "Serie GPU", nl: "GPU-serie", sv: "GPU-serie", pt: "Série de GPU", es: "Serie de GPU", de: "GPU-Serie" }],
  [/Card đồ họa/g, { en: "Graphics card", fr: "Carte graphique", it: "Scheda grafica", nl: "Videokaart", sv: "Grafikkort", pt: "Placa gráfica", es: "Tarjeta gráfica", de: "Grafikkarte" }],
  [/Tấm nền/g, { en: "Panel", fr: "Dalle", it: "Pannello", nl: "Paneel", sv: "Panel", pt: "Painel", es: "Panel", de: "Panel" }],
  [/Kiểu tai nghe/g, { en: "Earbud type", fr: "Type d'écouteurs", it: "Tipo di auricolari", nl: "Oortelefoon-type", sv: "Hörlurstyp", pt: "Tipo de auscultadores", es: "Tipo de auriculares", de: "Kopfhörertyp" }],
  [/Kích thước/g, { en: "Size", fr: "Taille", it: "Dimensione", nl: "Grootte", sv: "Storlek", pt: "Tamanho", es: "Tamaño", de: "Größe" }],
  [/Kết nối/g, { en: "Connection", fr: "Connexion", it: "Connessione", nl: "Verbinding", sv: "Anslutning", pt: "Ligação", es: "Conexión", de: "Verbindung" }],
];

function rebuildTech(lang, srcTech) {
  const pairs = [...srcTech.matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
  return `${HEAD[lang]}: {` + pairs.map(([, k, v]) => {
    let kk = k, vv = v;
    for (const [re, words] of SUBS) {
      if (words[lang]) {
        kk = kk.replace(re, words[lang]);
        vv = vv.replace(re, words[lang]);
      }
    }
    return `"${kk}": "${vv}"`;
  }).join(", ") + "}";
}

let rebuilt = 0;
for (const rec of importData.records) {
  const pid = rec.productId, lang = rec.targetLang;
  const block = blockByPid.get(pid);
  if (!block) continue;
  const tm = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
  if (!tm) continue;
  const newTech = rebuildTech(lang, tm[1]);
  if (hand[pid] && hand[pid][lang]) hand[pid][lang].technicalDescription = newTech;
  rec.translations.technicalDescription = newTech;
  rebuilt++;
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
fs.writeFileSync(IMPORT, JSON.stringify(importData, null, 2), "utf8");
console.log("tech rebuilt for", rebuilt);
let leftovers = 0;
for (const rec of importData.records) {
  const t = rec.translations.technicalDescription || "";
  const wl = validator.checkSourceLanguageLeak(rec.source.technicalDescription, t, rec.targetLang, "product_technical_description");
  if (wl) {
    leftovers++;
    console.log(rec.productId.slice(-4) + "/" + rec.targetLang, "leak:", wl.phrase);
  }
}
console.log("remaining tech leaks:", leftovers);
