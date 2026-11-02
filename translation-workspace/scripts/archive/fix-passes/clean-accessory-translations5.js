// Pass 5 — last legit-word whitelist additions + real leftovers fix.
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

// Real VN leftovers → replacement per language (found by scanning).
const FIX = {
  "dải tần": {
    en: "frequency band",
    pt: "banda de frequência",
    fr: "bande de fréquence",
    de: "Frequenzband",
    it: "banda di frequenza",
    es: "banda de frecuencia",
    nl: "frequentieband",
    sv: "frekvensband",
  },
  dải: {
    en: "band",
    pt: "banda",
    fr: "bande",
    de: "Band",
    it: "banda",
    es: "banda",
    nl: "band",
    sv: "band",
  },
  tần: {
    en: "frequency",
    pt: "frequência",
    fr: "fréquence",
    de: "Frequenz",
    it: "frequenza",
    es: "frecuencia",
    nl: "frequentie",
    sv: "frekvens",
  },
  cáp: {
    en: "cable",
    pt: "cabo",
    fr: "câble",
    de: "Kabel",
    it: "cavo",
    es: "cable",
    nl: "kabel",
    sv: "kabel",
  },
  rời: {
    en: "external",
    pt: "externo",
    fr: "externe",
    de: "extern",
    it: "esterno",
    es: "externo",
    nl: "extern",
    sv: "extern",
  },
  "thoải mái": {
    en: "comfortable",
    pt: "confortável",
    fr: "confortable",
    de: "bequem",
    it: "comodo",
    es: "cómodo",
    nl: "comfortabel",
    sv: "bekväm",
  },
  thoải: {
    en: "comfortable",
    pt: "confortável",
    fr: "confortable",
    de: "bequem",
    it: "comodo",
    es: "cómodo",
    nl: "comfortabel",
    sv: "bekväm",
  },
  giờ: {
    en: "hours",
    pt: "horas",
    fr: "heures",
    de: "Stunden",
    it: "ore",
    es: "horas",
    nl: "uur",
    sv: "timmar",
  },
  lần: {
    en: "time",
    pt: "vez",
    fr: "fois",
    de: "Mal",
    it: "volta",
    es: "vez",
    nl: "keer",
    sv: "gång",
  },
  bấm: {
    en: "press",
    pt: "pressão",
    fr: "pression",
    de: "Drücken",
    it: "pressione",
    es: "pulsación",
    nl: "druk",
    sv: "tryck",
  },
  "tiện lợi": {
    en: "convenient",
    pt: "conveniente",
    fr: "pratique",
    de: "praktisch",
    it: "comodo",
    es: "conveniente",
    nl: "handig",
    sv: "bekväm",
  },
  tiện: {
    en: "convenient",
    pt: "conveniente",
    fr: "pratique",
    de: "praktisch",
    it: "comodo",
    es: "conveniente",
    nl: "handig",
    sv: "bekväm",
  },
  lợi: {
    en: "benefit",
    pt: "benefício",
    fr: "avantage",
    de: "Vorteil",
    it: "vantaggio",
    es: "beneficio",
    nl: "voordeel",
    sv: "fördel",
  },
  gàng: {
    en: "line",
    pt: "linha",
    fr: "ligne",
    de: "Linie",
    it: "linea",
    es: "línea",
    nl: "lijn",
    sv: "linje",
  },
};

// Legit non-VN words with diacritics, whitelisted permanently.
const LEGIT = {
  pt: [
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

function sweep(text, lang) {
  let out = text;
  const keys = Object.keys(FIX).sort((a, b) => b.length - a.length);
  for (const phrase of keys) {
    if (out.includes(phrase)) {
      out = out.split(phrase).join(FIX[phrase][lang] || phrase);
    }
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
console.log("pass5 done; verifying...");
const VIET = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;
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
