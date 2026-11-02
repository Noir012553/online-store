// Final cleanup pass 2:
//  1. EN names: remove leftover VN color words in parentheses + fix to English.
//  2. IT descriptions: drop the false positives (qualità/Connettività/libertà/
//     flessibilità are legit Italian). Check remaining "dây/Kiểu/đồng bộ..." in alts.
//  3. ES "práctica/está/estándar/cálculo/rápida" are legit Spanish; "loại" is VN — fix.
//  4. EN descriptions leftovers: fix specific VN fragments still present.
//  5. FR "à" is legit; fix only real VN words (tối ưu, không thể, độc đáo, hệ, và, dây).
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

// Real VN words that must never appear in non-pt output (word-level, exact).
const VN_BLOCKLIST = [
  "Bàn",
  "cơ",
  "thiết",
  "kế",
  "tối",
  "ưu",
  "Màu",
  "sắc",
  "Kết",
  "nối",
  "Cảm",
  "biến",
  "dây",
  "không",
  "loại",
  "đồng",
  "bộ",
  "cấu",
  "sáu",
  "hỗ",
  "trợ",
  "điều",
  "khiển",
  "trực",
  "tiếp",
  "đèn",
  "bên",
  "trong",
  "kiểu",
  "lượng",
  "phá",
  "cách",
  "cực",
  "ngầu",
  "với",
  "được",
  "và",
  "nổi",
  "bật",
  "thể",
  "hoạt",
  "động",
  "đèn",
  "viên",
  "độc",
  "đáo",
  "hệ",
  "Xám",
  "trắng",
  "dương",
  "lá",
  "Trắng",
  "Lá",
  "Dương",
  "đậm",
  "cổ",
  "triệu",
  "màu",
];
const REPLACEMENTS = {
  "Bàn phím cơ": {
    en: "Mechanical keyboard",
    pt: "Teclado mecânico",
    fr: "Clavier mécanique",
    de: "Mechanische Tastatur",
    it: "Tastiera meccanica",
    es: "Teclado mecánico",
    nl: "Mechanisch toetsenbord",
    sv: "Mekaniskt tangentbord",
  },
  "Bàn phím": {
    en: "Keyboard",
    pt: "Teclado",
    fr: "Clavier",
    de: "Tastatur",
    it: "Tastiera",
    es: "Teclado",
    nl: "Toetsenbord",
    sv: "Tangentbord",
  },
  "thiết kế tối ưu": {
    en: "optimized design",
    pt: "design otimizado",
    fr: "design optimisé",
    de: "optimiertes Design",
    it: "design ottimizzato",
    es: "diseño optimizado",
    nl: "geoptimaliseerd ontwerp",
    sv: "optimerad design",
  },
  "Màu sắc": {
    en: "Color",
    pt: "Cor",
    fr: "Couleur",
    de: "Farbe",
    it: "Colore",
    es: "Color",
    nl: "Kleur",
    sv: "Färg",
  },
  "Kết nối": {
    en: "Connection",
    pt: "Ligação",
    fr: "Connexion",
    de: "Verbindung",
    it: "Connessione",
    es: "Conexión",
    nl: "Verbinding",
    sv: "Anslutning",
  },
  "Cảm biến": {
    en: "Sensor",
    pt: "Sensor",
    fr: "Capteur",
    de: "Sensor",
    it: "Sensore",
    es: "Sensor",
    nl: "Sensor",
    sv: "Sensor",
  },
  "không dây": {
    en: "wireless",
    pt: "sem fios",
    fr: "sans fil",
    de: "kabellos",
    it: "wireless",
    es: "inalámbrico",
    nl: "draadloos",
    sv: "trådlös",
  },
  "có dây": {
    en: "wired",
    pt: "com fios",
    fr: "filaire",
    de: "kabelgebunden",
    it: "cablata",
    es: "con cable",
    nl: "bedraad",
    sv: "trådbunden",
  },
  "đồng bộ": {
    en: "sync",
    pt: "sincronização",
    fr: "synchronisation",
    de: "Synchronisierung",
    it: "sincronizzazione",
    es: "sincronización",
    nl: "synchronisatie",
    sv: "synkronisering",
  },
  "cấu trúc": {
    en: "structure",
    pt: "estrutura",
    fr: "structure",
    de: "Struktur",
    it: "struttura",
    es: "estructura",
    nl: "structuur",
    sv: "struktur",
  },
  "hỗ trợ điều khiển trực tiếp": {
    en: "supports direct control",
    pt: "suporta controlo direto",
    fr: "prend en charge le contrôle direct",
    de: "unterstützt direkte Steuerung",
    it: "supporta il controllo diretto",
    es: "soporta control directo",
    nl: "ondersteunt directe bediening",
    sv: "stödjer direkt styrning",
  },
  "hỗ trợ": {
    en: "supports",
    pt: "suporta",
    fr: "prend en charge",
    de: "unterstützt",
    it: "supporta",
    es: "soporta",
    nl: "ondersteunt",
    sv: "stödjer",
  },
  "đèn bên trong": {
    en: "internal lighting",
    pt: "iluminação interna",
    fr: "éclairage interne",
    de: "Innenbeleuchtung",
    it: "illuminazione interna",
    es: "iluminación interna",
    nl: "interne verlichting",
    sv: "intern belysning",
  },
  "kiểu dáng": {
    en: "design",
    pt: "design",
    fr: "design",
    de: "Design",
    it: "design",
    es: "diseño",
    nl: "ontwerp",
    sv: "design",
  },
  "lượng phá": {
    en: "amount breaks",
    pt: "quantidade quebra",
    fr: "quantité casse",
    de: "Menge bricht",
    it: "quantità rompe",
    es: "cantidad rompe",
    nl: "hoeveelheid breekt",
    sv: "mängd bryter",
  }, // safety net, unlikely
  "cách cực ngầu với": {
    en: "in a super cool way with",
    pt: "de forma muito legal com",
    fr: "de manière super cool avec",
    de: "auf supercoole Weise mit",
    it: "in modo super figo con",
    es: "de forma muy genial con",
    nl: "op supercoole wijze met",
    sv: "på ett supercoolt sätt med",
  },
  loại: {
    en: "type",
    pt: "tipo",
    fr: "type",
    de: "Typ",
    it: "tipo",
    es: "tipo",
    nl: "type",
    sv: "typ",
  },
  "được phối màu": {
    en: "color-coordinated",
    pt: "combinado em cores",
    fr: "assorti en couleurs",
    de: "farblich abgestimmt",
    it: "abbinato nei colori",
    es: "coordinado en color",
    nl: "kleurcoördinatie",
    sv: "färgkoordinerad",
  },
  "và nổi bật": {
    en: "and striking",
    pt: "e marcante",
    fr: "et marquant",
    de: "und markant",
    it: "e marcante",
    es: "y llamativo",
    nl: "en opvallend",
    sv: "och iögonfallande",
  },
  với: {
    en: "with",
    pt: "com",
    fr: "avec",
    de: "mit",
    it: "con",
    es: "con",
    nl: "met",
    sv: "med",
  },
  "hoạt động": {
    en: "operation",
    pt: "operação",
    fr: "fonctionnement",
    de: "Betrieb",
    it: "funzionamento",
    es: "funcionamiento",
    nl: "werking",
    sv: "funktion",
  },
  "đèn viên": {
    en: "light tube",
    pt: "tubo de luz",
    fr: "tube lumineux",
    de: "Lichtrohr",
    it: "tubo luminoso",
    es: "tubo de luz",
    nl: "lichtbuis",
    sv: "ljusrör",
  },
  "độc đáo": {
    en: "unique",
    pt: "único",
    fr: "unique",
    de: "einzigartig",
    it: "unico",
    es: "único",
    nl: "uniek",
    sv: "unik",
  },
  hệ: {
    en: "system",
    pt: "sistema",
    fr: "système",
    de: "System",
    it: "sistema",
    es: "sistema",
    nl: "systeem",
    sv: "system",
  },
  "tối ưu": {
    en: "optimized",
    pt: "otimizado",
    fr: "optimisé",
    de: "optimiert",
    it: "ottimizzato",
    es: "optimizado",
    nl: "geoptimaliseerd",
    sv: "optimerad",
  },
  "không thể": {
    en: "cannot",
    pt: "não é possível",
    fr: "impossible",
    de: "nicht möglich",
    it: "impossibile",
    es: "no es posible",
    nl: "niet mogelijk",
    sv: "omöjligt",
  },
  cấu: {
    en: "structure",
    pt: "estrutura",
    fr: "structure",
    de: "Struktur",
    it: "struttura",
    es: "estructura",
    nl: "structuur",
    sv: "struktur",
  },
  sáu: {
    en: "six",
    pt: "seis",
    fr: "six",
    de: "sechs",
    it: "sei",
    es: "seis",
    nl: "zes",
    sv: "sex",
  },
  đèn: {
    en: "light",
    pt: "luz",
    fr: "lumière",
    de: "Licht",
    it: "luce",
    es: "luz",
    nl: "licht",
    sv: "ljus",
  },
  "bên trong": {
    en: "inside",
    pt: "dentro",
    fr: "à l'intérieur",
    de: "innen",
    it: "all'interno",
    es: "dentro",
    nl: "binnenin",
    sv: "inuti",
  },
  "trực tiếp": {
    en: "direct",
    pt: "direto",
    fr: "direct",
    de: "direkt",
    it: "diretto",
    es: "directo",
    nl: "direct",
    sv: "direkt",
  },
  "điều khiển": {
    en: "control",
    pt: "controlo",
    fr: "contrôle",
    de: "Steuerung",
    it: "controllo",
    es: "control",
    nl: "bediening",
    sv: "styrning",
  },
  dây: {
    en: "wire",
    pt: "fio",
    fr: "fil",
    de: "Kabel",
    it: "filo",
    es: "cable",
    nl: "draad",
    sv: "tråd",
  },
  kiểu: {
    en: "style",
    pt: "estilo",
    fr: "style",
    de: "Stil",
    it: "stile",
    es: "estilo",
    nl: "stijl",
    sv: "stil",
  },
  lượng: {
    en: "amount",
    pt: "quantidade",
    fr: "quantité",
    de: "Menge",
    it: "quantità",
    es: "cantidad",
    nl: "hoeveelheid",
    sv: "mängd",
  },
  Xám: {
    en: "Gray",
    pt: "Cinza",
    fr: "Gris",
    de: "Grau",
    it: "Grigio",
    es: "Gris",
    nl: "Grijs",
    sv: "Grå",
  },
  trắng: {
    en: "white",
    pt: "branco",
    fr: "blanc",
    de: "weiß",
    it: "bianco",
    es: "blanco",
    nl: "wit",
    sv: "vit",
  },
  Trắng: {
    en: "White",
    pt: "Branco",
    fr: "Blanc",
    de: "Weiß",
    it: "Bianco",
    es: "Blanco",
    nl: "Wit",
    sv: "Vit",
  },
  dương: {
    en: "blue",
    pt: "azul",
    fr: "bleu",
    de: "blau",
    it: "blu",
    es: "azul",
    nl: "blauw",
    sv: "blå",
  },
  Dương: {
    en: "Blue",
    pt: "Azul",
    fr: "Bleu",
    de: "Blau",
    it: "Blu",
    es: "Azul",
    nl: "Blauw",
    sv: "Blå",
  },
  lá: {
    en: "green",
    pt: "verde",
    fr: "vert",
    de: "grün",
    it: "verde",
    es: "verde",
    nl: "groen",
    sv: "grön",
  },
  Lá: {
    en: "Green",
    pt: "Verde",
    fr: "Vert",
    de: "Grün",
    it: "Verde",
    es: "Verde",
    nl: "Groen",
    sv: "Grön",
  },
  đậm: {
    en: "bold",
    pt: "ousado",
    fr: "audacieux",
    de: "kräftig",
    it: "audace",
    es: "audaz",
    nl: "gedurfd",
    sv: "djärv",
  },
  cổ: {
    en: "classic",
    pt: "clássico",
    fr: "classique",
    de: "klassisch",
    it: "classico",
    es: "clásico",
    nl: "klassiek",
    sv: "klassisk",
  },
  triệu: {
    en: "million",
    pt: "milhão",
    fr: "million",
    de: "Million",
    it: "milione",
    es: "millón",
    nl: "miljoen",
    sv: "miljon",
  },
  màu: {
    en: "color",
    pt: "cor",
    fr: "couleur",
    de: "Farbe",
    it: "colore",
    es: "color",
    nl: "kleur",
    sv: "färg",
  },
  thiết: {
    en: "design",
    pt: "design",
    fr: "design",
    de: "Design",
    it: "design",
    es: "diseño",
    nl: "ontwerp",
    sv: "design",
  },
  Bàn: {
    en: "Desk",
    pt: "Mesa",
    fr: "Bureau",
    de: "Schreibtisch",
    it: "Scrivania",
    es: "Escritorio",
    nl: "Bureau",
    sv: "Skrivbord",
  },
  cơ: {
    en: "mechanical",
    pt: "mecânico",
    fr: "mécanique",
    de: "mechanisch",
    it: "meccanico",
    es: "mecánico",
    nl: "mechanisch",
    sv: "mekanisk",
  },
  "nổi bật": {
    en: "striking",
    pt: "marcante",
    fr: "marquant",
    de: "markant",
    it: "marcante",
    es: "llamativo",
    nl: "opvallend",
    sv: "iögonfallande",
  },
  thể: {
    en: "can",
    pt: "pode",
    fr: "peut",
    de: "kann",
    it: "può",
    es: "puede",
    nl: "kan",
    sv: "kan",
  },
  và: {
    en: "and",
    pt: "e",
    fr: "et",
    de: "und",
    it: "e",
    es: "y",
    nl: "en",
    sv: "och",
  },
  nổi: {
    en: "striking",
    pt: "marcante",
    fr: "marquant",
    de: "markant",
    it: "marcante",
    es: "llamativo",
    nl: "opvallend",
    sv: "iögonfallande",
  },
  bật: {
    en: "on",
    pt: "ligado",
    fr: "activé",
    de: "ein",
    it: "acceso",
    es: "encendido",
    nl: "aan",
    sv: "på",
  },
};

// EN name cleanups: "(Xanh green be)" → "(Green)", "(Đen + Xanh bold + Cam/ Reaper Switch" → English
function fixEnName(name) {
  return name
    .replace(/\(Xanh green be\)/g, "(Green)")
    .replace(
      /\(Đen \+ Xanh bold \+ Cam\/ Reaper Switch\)/g,
      "(Black + Bold Blue + Orange/ Reaper Switch)",
    )
    .replace(/\(Xám trắng dương\)/g, "(Gray White Blue)")
    .replace(/\(Trắng \+ Xanh dương đậm\)/g, "(White + Bold Blue)")
    .replace(/\(Xanh dương đậm\)/g, "(Bold Blue)")
    .replace(/\(Trắng lá\)/g, "(White Green)")
    .replace(/\(Trắng\)/g, "(White)")
    .replace(/\(Đen\)/g, "(Black)")
    .replace(/\(Xanh dương\)/g, "(Blue)")
    .replace(/\(hồng\)/gi, "(Pink)")
    .replace(/\(đen obsidian\)/gi, "(Obsidian Black)");
}

for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    if (
      lang === "en" ||
      lang === "fr" ||
      lang === "de" ||
      lang === "es" ||
      lang === "it" ||
      lang === "nl" ||
      lang === "sv" ||
      lang === "pt"
    ) {
      let name = t.name;
      if (lang === "en") name = fixEnName(name);
      // Apply phrase replacements longest-first for non-pt languages and pt check for VN-only words
      let desc = t.description;
      let tech = t.technicalDescription;
      let alts = (t.imageAlts || []).join("\u0000");
      const keys = Object.keys(REPLACEMENTS).sort(
        (a, b) => b.length - a.length,
      );
      const applyTo = (text) => {
        let out = text;
        for (const phrase of keys) {
          if (
            lang === "pt" &&
            ![
              "Bàn phím cơ",
              "Bàn phím",
              "Màu sắc",
              "Kết nối",
              "Cảm biến",
              "không dây",
              "có dây",
              "thiết kế tối ưu",
              "kiểu dáng",
              "đèn bên trong",
              "đồng bộ",
              "cấu trúc",
              "hỗ trợ điều khiển trực tiếp",
              "hỗ trợ",
              "được phối màu",
              "loại",
            ].includes(phrase)
          ) {
            // skip generic VN→pt translations that would corrupt real Portuguese
            if (
              /^(và|với|thể|nổi|bật|hệ|độc|đáo|cấu|sáu|đèn|bên|trong|trực|tiếp|dây|kiểu|lượng|Xám|trắng|Trắng|dương|Dương|lá|Lá|đậm|cổ|triệu|màu|thiết|cơ|Bàn)$/.test(
                phrase,
              )
            )
              continue;
          }
          const rep = REPLACEMENTS[phrase][lang] || phrase;
          out = out.split(phrase).join(rep);
        }
        return out;
      };
      desc = applyTo(desc);
      tech = applyTo(tech);
      alts = applyTo(alts);
      t.name = name;
      t.description = desc;
      t.technicalDescription = tech;
      t.imageAlts = alts.split("\u0000");
    }
  }
}
save(handPath, hand);
console.log("pass2 cleaned; verifying...");
const VIET = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;
const PT_LEGIT = new Set([
  "prática",
  "prático",
  "introdução",
  "construção",
  "diário",
  "padrão",
  "cálculo",
  "rápida",
  "qualidade",
  "espaços",
  "configurações",
  "flexibilidade",
  "sessões",
  "estável",
  "prático",
  "serviço",
  "carcaça",
  "keycaps",
  "espaço",
  "fios",
  "unica",
  "única",
]);
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
    const m =
      all.match(
        /[\p{L}]*[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự][\p{L}]*/gu,
      ) || [];
    let flagged = [...new Set(m)];
    if (lang === "pt")
      flagged = flagged.filter((w) => VN_BLOCKLIST.includes(w));
    else if (lang === "fr")
      flagged = flagged.filter((w) =>
        VN_BLOCKLIST.includes(w) || w === "à"
          ? VN_BLOCKLIST.includes(w)
          : false,
      );
    else if (lang === "it")
      flagged = flagged.filter((w) => VN_BLOCKLIST.includes(w));
    else flagged = flagged; // en/de/es/nl/sv shouldn't have these chars naturally
    if (flagged.length) {
      console.log(pid.slice(-4), lang, flagged.slice(0, 8).join(", "));
      bad++;
    }
  }
}
console.log(bad ? bad + " records still flagged" : "ALL CLEAN");
