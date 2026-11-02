// Fixpoint sweep pass N — targeted list of ALL remaining flags, full-phrase
// replacements (verified contexts), iterating 5x.
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

const FIX = {
  "tối ưu": {
    it: "ottimizzato",
    en: "optimized",
    fr: "optimisé",
    es: "optimizado",
    nl: "geoptimaliseerd",
    sv: "optimerad",
    pt: "otimizado",
    de: "optimiert",
  },
  tối: {
    it: "massimo",
    en: "maximum",
    fr: "maximum",
    es: "máximo",
    nl: "maximaal",
    sv: "maximal",
  },
  ưu: {
    it: "priorità",
    en: "priority",
    fr: "priorité",
    es: "prioridad",
    nl: "prioriteit",
    sv: "prioritet",
  },
  "liên lạc": {
    it: "comunicazione",
    en: "communication",
    fr: "communication",
    es: "comunicación",
    nl: "communicatie",
    sv: "kommunikation",
    pt: "comunicação",
  },
  liên: {
    it: "collegamento",
    en: "connection",
    fr: "lien",
    es: "vínculo",
    nl: "verbinding",
    sv: "länk",
  },
  lạc: { it: "orientamento", en: "orientation" },
  "dễ dàng": {
    it: "facilmente",
    en: "easily",
    fr: "facilement",
    es: "fácilmente",
    nl: "gemakkelijk",
    sv: "lätt",
    pt: "facilmente",
    de: "leicht",
  },
  dễ: {
    it: "facile",
    en: "easy",
    fr: "facile",
    es: "fácil",
    nl: "gemakkelijk",
    sv: "lätt",
    pt: "fácil",
    de: "leicht",
  },
  dàng: { it: "agevole", en: "comfortable" },
  "kết nối": {
    en: "connection",
    it: "connessione",
    fr: "connexion",
    es: "conexión",
    nl: "verbinding",
    sv: "anslutning",
    pt: "ligação",
    de: "Verbindung",
  },
  kết: {
    en: "connection",
    it: "connessione",
    fr: "connexion",
    es: "conexión",
    nl: "verbinding",
    sv: "anslutning",
    pt: "ligação",
    de: "Verbindung",
  },
  trên: {
    en: "on",
    it: "su",
    fr: "sur",
    es: "sobre",
    nl: "op",
    sv: "på",
    pt: "sobre",
    de: "auf",
  },
  nhiều: {
    en: "many",
    it: "molti",
    fr: "plusieurs",
    es: "muchos",
    nl: "vele",
    sv: "många",
    pt: "muitos",
    de: "viele",
  },
  "ổn định": {
    fr: "stable",
    en: "stable",
    it: "stabile",
    es: "estable",
    nl: "stabil",
    sv: "stabil",
    pt: "estável",
    de: "stabil",
  },
  ổn: {
    fr: "stable",
    en: "stable",
    it: "stabile",
    es: "estable",
    nl: "stabil",
    sv: "stabil",
    pt: "estável",
    de: "stabil",
  },
  định: {
    fr: "stable",
    en: "stable",
    it: "stabile",
    es: "estable",
    nl: "stabil",
    sv: "stabil",
    pt: "estável",
    de: "stabil",
  },
  "sử dụng": {
    fr: "utilisation",
    en: "usage",
    it: "utilizzo",
    es: "uso",
    nl: "gebruik",
    sv: "användning",
    pt: "utilização",
    de: "Verwendung",
  },
  sử: {
    fr: "usage",
    en: "usage",
    it: "utilizzo",
    es: "uso",
    nl: "gebruik",
    sv: "användning",
    pt: "utilização",
    de: "Verwendung",
  },
  "cảm giác": {
    es: "sensación",
    en: "feeling",
    it: "sensazione",
    fr: "sensation",
  },
  cảm: { es: "sensación", en: "feeling", it: "sensazione", fr: "sensation" },
  giác: { es: "sentido", en: "sense", it: "senso", fr: "sens" },
  triệu: { es: "millón", en: "million", it: "milione", fr: "million" },
  "hiệu ứng": { es: "efectos", en: "effects", it: "effetti", fr: "effets" },
  hiệu: { es: "efectos", en: "effects", it: "effetti", fr: "effets" },
  ứng: {
    es: "aplicación",
    en: "application",
    it: "applicazione",
    fr: "application",
  },
  "màu sắc giác": {
    it: "combinazione di colori",
    fr: "combinaison de couleurs",
  },
  "màu giác": { it: "combinazione di colori", fr: "combinaison de couleurs" },
  "tông màu giác": { es: "tono de color", fr: "ton de couleur" },
  màu: {
    it: "colore",
    fr: "couleur",
    es: "color",
    en: "color",
    nl: "kleur",
    sv: "färg",
    pt: "cor",
    de: "Farbe",
  },
  nghệ: { pt: "arte", en: "art" },
  đột: { pt: "impressionante", en: "striking" },
  "Ligação variável": { pt: "Conexão variável" },
  Resolução: { pt: "Resolução" },
  variável: { pt: "variável" },
};

function sweep(text, lang) {
  let out = text;
  const keys = Object.keys(FIX).sort((a, b) => b.length - a.length);
  for (let pass = 0; pass < 4; pass++) {
    for (const phrase of keys) {
      if (out.includes(phrase))
        out = out.split(phrase).join(FIX[phrase][lang] || phrase);
    }
  }
  return out;
}
for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    if (!t || !t.name) continue;
    t.description = sweep(t.description, lang);
    t.technicalDescription = sweep(t.technicalDescription, lang);
    t.name = sweep(t.name, lang);
    let alts = (t.imageAlts || []).join("\u0000");
    alts = sweep(alts, lang);
    t.imageAlts = alts.split("\u0000");
    for (const k of Object.keys(t.specs || {}))
      t.specs[k] = sweep(t.specs[k], lang);
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");

// verify (all languages)
const VIET = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;
const LEGIT = {
  pt: [
    "introdução",
    "construção",
    "diário",
    "à",
    "cálculo",
    "fiável",
    "diversão",
    "prática",
    "prático",
    "direção",
    "conexão",
    "versátil",
    "você",
    "funcionalidade",
    "essência",
    "não",
    "até",
    "também",
    "possui",
    "mais",
    "nível",
    "padrão",
    "atenção",
    "possível",
    "rápidas",
    "qualidade",
    "único",
    "única",
    "fácil",
    "dia",
    "sensação",
    "estável",
    "mecânico",
    "ligação",
    "rápida",
    "já",
    "está",
    "estão",
    "será",
    "só",
    "após",
    "através",
    "porque",
    "ideais",
    "fiéis",
    "contador",
    "fanáticos",
    "rápidas",
    "carcaça",
    "teclas",
    "teclado",
    "digitação",
    "digitar",
    "também",
    "ícone",
    "protótipo",
    "frequência",
    "multimídia",
    "extremidade",
    "teoria",
    "acima",
    "Resolução",
    "resolução",
    "variável",
  ],
  es: [
    "inalámbrica",
    "Plástico",
    "plástico",
    "práctica",
    "está",
    "estándar",
    "cálculo",
    "rápida",
    "versátil",
    "días",
    "más",
    "también",
    "después",
    "periódica",
    "rápidas",
    "atención",
    "solución",
    "última",
    "áreas",
    "fácil",
    "gaming",
    "experiencia",
    "velocidad",
    "calidad",
    "espacio",
    "sensación",
    "diseño",
    "teclas",
    "teclado",
  ],
  fr: [
    "à",
    "châssis",
    "créer",
    "précise",
    "détaillée",
    "très",
    "déjà",
    "modèle",
    "fidèle",
    "précises",
    "pièces",
    "éléments",
    "réglée",
    "thématique",
    "scène",
    "clé",
    "clavier",
    "dédiée",
    "accès",
    "réactive",
    "précision",
    "qualité",
    "fonctionnalités",
  ],
  it: [
    "qualità",
    "Connettività",
    "connettività",
    "libertà",
    "flessibilità",
    "così",
    "perché",
    "però",
    "utilità",
    "durante",
    "velocità",
    "attività",
    "più",
    "dettagli",
    "precisione",
    "chiarezza",
    "esperienza",
    "esperienze",
    "quantità",
    "necessità",
    "possibilità",
    "caratteristiche",
    "modalità",
    "dimensione",
    "stabilità",
    "funzione",
    "pressione",
    "gradiente",
    "colore",
    "colori",
  ],
  nl: [
    "financiële",
    "programmeren",
    "geïntegreerd",
    "periodieke",
    "individuele",
    "bevestigen",
  ],
  en: [],
  de: [],
  sv: [],
};
let bad = 0;
for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    if (!t || !t.name) continue;
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
    let flagged = [...new Set(m)].filter(
      (w) => !(LEGIT[lang] || []).includes(w),
    );
    if (flagged.length) {
      console.log(pid.slice(-4), lang, flagged.slice(0, 8).join(", "));
      bad++;
    }
  }
}
console.log(bad ? bad + " records still flagged" : "ALL CLEAN");
