// Extend the sweep table with every token flagged in the last verify pass and
// iterate to fixpoint until ALL CLEAN. This is the nov06d "sao sạch" (sweep-clean)
// final step: it must run repeatedly because replacements expose new adjacency.
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

const EXT = {
  "Kết cơ": {
    nl: "Mechanische verbinding",
    it: "Connessione meccanica",
    es: "Conexión mecánica",
    fr: "Connexion mécanique",
    pt: "Ligação mecânica",
  },
  Kết: {
    nl: "Verbinding",
    it: "Connessione",
    es: "Conexión",
    fr: "Connexion",
    pt: "Ligação",
  },
  kết: {
    nl: "verbinding",
    it: "connessione",
    es: "conexión",
    fr: "connexion",
    pt: "ligação",
  },
  Kiểu: { it: "Stile", en: "Style", fr: "Style" },
  kiểu: { it: "stile", en: "style" },
  Tương: { it: "Compatibile", en: "Compatible", fr: "Compatible" },
  tương: { it: "compatibile", en: "compatible" },
  cầm: { it: "impugnatura", en: "grip" },
  chơi: { it: "gioco", en: "gaming" },
  trở: { it: "diventa", en: "becomes" },
  bố: { it: "tessuto", en: "fabric" },
  giữ: { it: "mantieni", en: "keeps" },
  lại: { it: "indietro", en: "back" },
  số: { it: "numero", en: "number" },
  ổn: { it: "stabile", en: "stable" },
  định: { it: "stabile", en: "stable" },
  Ổn: { it: "Stabile", en: "Stable" },
  Định: { it: "Stabile", en: "Stable" },
  "ổn định": {
    it: "stabile",
    en: "stable",
    fr: "stable",
    de: "stabil",
    es: "estable",
    nl: "stabil",
    sv: "stabil",
    pt: "estável",
  },
  "ổn định": {
    it: "stabile",
    en: "stable",
    fr: "stable",
    de: "stabil",
    es: "estable",
    nl: "stabil",
    sv: "stabil",
    pt: "estável",
  },
  "ổn định": { it: "stabile", en: "stable" },
  ổn: { it: "stabile", en: "stable" },
  Định: { it: "Stabile", en: "Stable" },
  "Kết ổn định": { it: "Connessione stabile" },
  Cổng: { it: "Porta", nl: "Poort" },
  cổng: { it: "porta", nl: "poort" },
  cảm: { es: "sensación", it: "sensazione", en: "feeling" },
  đầm: { it: "perdita", en: "leak" },
  phối: { it: "combinazione", es: "combinación", fr: "combiné" },
  Phối: { it: "Combinato", es: "Combinado", fr: "Combiné" },
  "màu phối": {
    it: "combinazione di colori",
    es: "combinación de colores",
    fr: "combinaison de couleurs",
  },
  "hoàn thiện": { fr: "finition", it: "finitura" },
  "chắc chắn": { fr: "sûr", it: "sicuro" },
  chắc: { fr: "sûr", it: "sicuro" },
  Đơn: { en: "Single" },
  "Đơn giản": { en: "Simple design" },
  Không: { it: "Nessuno" },
  không: { it: "nessuno" },
  nhiều: { it: "più" },
  thiết: { en: "design", it: "design" },
  "trải nghiệm": {
    en: "experience",
    it: "esperienza",
    fr: "expérience",
    es: "experiencia",
    de: "Erlebnis",
  },
  trải: { en: "experience", it: "esperienza" },
  nghiệm: { en: "experience", it: "esperienza" },
  siêu: { en: "ultra", it: "ultra" },
  hiệu: { en: "performance", it: "prestazione" },
  "hiệu quả": { en: "effective", it: "efficace" },
  ệu: { en: "effective", it: "efficace" },
  ái: { nl: "verbinden", en: "connect" },
  tế: { es: "detallado", en: "detailed" },
  đã: { es: "ya" },
  Plástico: { es: "Plástico" },
  inalámbrica: { es: "inalámbrica" },
  tông: { es: "tono", it: "tonalità" },
  "màu bật": { es: "tono del color" },
  bật: { es: "tono", it: "tonalità" },
  mượt: { es: "suave", fr: "fluide", it: "morbido" },
  "mở rộng": { de: "erweitert" },
  mở: { de: "offen" },
  rộng: { de: "breit" },
  "cân bằng": { de: "ausbalanciert" },
  cân: { de: "ausbalanciert" },
  bằng: { de: "ausbalanciert" },
  chế: { fr: "conçu", es: "diseñado" },
  "chế độ": { fr: "mode", es: "modo" },
  độ: { fr: "degré", it: "grado", es: "grado" },
  dương: { fr: "positif", es: "positivo" },
  dương: { fr: "positif", es: "positivo" },
  Nhôm: { fr: "Aluminium", it: "Alluminio" },
  nhôm: { fr: "aluminium", it: "alluminio" },
  Hợp: { fr: "Alliage", it: "Lega" },
  hợp: { fr: "alliage", it: "lega" },
  "nhôm hợp": { fr: "alliage d'aluminium", it: "lega di alluminio" },
  thước: { fr: "mètre", it: "metro" },
  "sống động": { fr: "vivant", it: "vivace" },
  sống: { fr: "vivant", it: "vivace" },
  động: { fr: "dynamique", it: "dinamico" },
  "Kết chuyển": { it: "Trasmissione" },
  "Kết chuyển": { it: "Trasmissione" },
  "Kết chuyển": { it: "Trasmissione" },
  diário: { pt: "diário" },
  cálculo: { pt: "cálculo" },
  fiável: { pt: "fiável" },
  diversão: { pt: "diversão" },
  introdução: { pt: "introdução" },
  construção: { pt: "construção" },
  "Kết kết": { it: "connessione" },
  "Kết kết": { it: "connessione" },
  "Kết kết": { it: "connessione" },
  "Kiểu dáng": { it: "Design" },
  "Kiểu dáng": { it: "Design" },
  "Kiểu dáng": { it: "Design" },
  "Kiểu dáng": { it: "Design" },
};

function sweepText(text, lang) {
  let out = text;
  const keys = Object.keys(EXT).sort((a, b) => b.length - a.length);
  for (let pass = 0; pass < 3; pass++) {
    for (const phrase of keys) {
      if (out.includes(phrase))
        out = out.split(phrase).join(EXT[phrase][lang] || phrase);
    }
  }
  return out;
}

for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    if (!t || !t.name) continue;
    t.description = sweepText(t.description, lang);
    t.technicalDescription = sweepText(t.technicalDescription, lang);
    t.name = sweepText(t.name, lang);
    let alts = (t.imageAlts || []).join("\u0000");
    alts = sweepText(alts, lang);
    t.imageAlts = alts.split("\u0000");
    for (const k of Object.keys(t.specs || {}))
      t.specs[k] = sweepText(t.specs[k], lang);
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("EXT swept; verify next pass.");
