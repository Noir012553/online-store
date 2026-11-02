// Pass 6 — last fix: "riêng" and add "frequência" whitelist to pt.
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

const FIX = {
  riêng: {
    en: "own",
    pt: "própria",
    fr: "propre",
    de: "eigen",
    it: "propria",
    es: "propia",
    nl: "eigen",
    sv: "egen",
  },
};
const LEGIT_PT_EXTRA = [
  "frequência",
  "própria",
  "próprio",
  "realização",
  "transformação",
  "dependendo",
  "informação",
];

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
save(handPath, hand);
console.log("pass6 done; verifying...");
const VIET = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;
const LEGIT = {
  pt: [
    "frequência",
    "própria",
    "próprio",
    "realização",
    "transformação",
    "dependendo",
    "informação",
    "mantêm",
    "pressão",
    "precisão",
    "fiável",
    "diversão",
    "durável",
    "milhão",
    "introdução",
    "construção",
    "diário",
    "à",
    "cálculo",
    "sensação",
    "estável",
    "mecânico",
    "ligação",
    "rápida",
    "já",
    "prática",
    "prático",
    "está",
    "estão",
    "conexão",
    "versátil",
    "você",
    "será",
    "só",
    "até",
    "também",
    "possui",
    "então",
    "após",
    "através",
    "partir",
    "porque",
    "dia",
    "mais",
    "nível",
    "padrão",
    "ideais",
    "fiéis",
    "contador",
    "fanáticos",
    "atenção",
    "possível",
    "rápidas",
    "não",
    "qualidade",
    "único",
    "única",
    "fácil",
    "dependerá",
    "ação",
    "comunicação",
  ],
  es: [
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
