// Final whitelist for confirmed-legit non-VN words + last 4 real leftovers.
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
  "màu giác": { it: "combinazione di colori", fr: "combinaison de couleurs" },
  "màu sắc giác": {
    it: "combinazione di colori",
    fr: "combinaison de couleurs",
  },
  "tông màu giác": { es: "tono de color", fr: "ton de couleur" },
  "cảm giác": { es: "sensación", en: "feeling" },
  "nền tảng": { es: "plataforma", en: "platform" },
  nền: { es: "base", en: "base" },
  tảng: { es: "base", en: "base" },
  mà: { es: "que", en: "that" },
  bằng: { es: "con", de: "aus" },
  "ổn định": { es: "estable", en: "stable" },
  ổn: { es: "estable", en: "stable" },
  định: { es: "estable", en: "estable" },
  đẹp: { es: "bonito", en: "beautiful" },
  nhiều: { es: "muchos", it: "più" },
};
const LEGIT_EXTRA = {
  es: ["inalámbrica", "Plástico", "plástico", "combina", "combinación"],
  fr: ["màu"],
  pt: [
    "introdução",
    "construção",
    "diário",
    "à",
    "cálculo",
    "fiável",
    "diversão",
  ],
};

function sweep(text, lang) {
  let out = text;
  const keys = Object.keys(FIX).sort((a, b) => b.length - a.length);
  for (const phrase of keys) {
    if (out.includes(phrase))
      out = out.split(phrase).join(FIX[phrase][lang] || phrase);
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

// Verify
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
      (w) =>
        !(
          (LEGIT[lang] || []).includes(w) ||
          (LEGIT_EXTRA[lang] || []).includes(w)
        ),
    );
    if (flagged.length) {
      console.log(pid.slice(-4), lang, flagged.slice(0, 8).join(", "));
      bad++;
    }
  }
}
console.log(bad ? bad + " records still flagged" : "ALL CLEAN");
