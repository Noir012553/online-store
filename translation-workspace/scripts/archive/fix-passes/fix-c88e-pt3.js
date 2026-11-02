// c88e/pt — the Logitech record needs proper alt translations. Rewrite each
// alt with fluent Portuguese keeping brand/model tokens (Logitech, Pro X2
// Superstrike Lightspeed, HERO 2, 8000Hz, G HUB).
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
const rec = hand["6ad0d5ed0069aece85a8c88e"].pt;

const BRAND = "Logitech";
rec.name = "Rato gaming sem fios " + BRAND + " Pro X2 Superstrike Lightspeed";
// Description intro: keep tokens, translate scaffolding in-place.
// Safer: strip all VN leftover phrases sentence-by-sentence via replacements.
const REPL = [
  [/Rato gaming Logitech sem fios/g, "Rato gaming sem fios Logitech"],
  [/descobrir o rato/gi, "Descubra o rato"],
  [
    /Logitech Pro X2 Superstrike Lightspeed/g,
    "Logitech Pro X2 Superstrike Lightspeed",
  ],
  [/không dây/g, "sem fios"],
  [/công nghệ SUPERSTRIKE đột phá/g, "tecnologia SUPERSTRIKE inovadora"],
  [/cảm biến HERO 2 chính xác/g, "sensor HERO 2 preciso"],
  [
    /kết nối LIGHTSPEED không dây ổn định/g,
    "ligação LIGHTSPEED sem fios estável",
  ],
  [
    /có thể tùy chỉnh qua G HUB thông minh/g,
    "personalizável através do inteligente G HUB",
  ],
  [/thiết kế bền bỉ/g, "design resistente"],
];
function tr(text) {
  let out = text;
  for (const [re, rep] of REPL) out = out.replace(re, rep);
  return out;
}
rec.imageAlts = [
  "Rato Logitech Pro X2 Superstrike Lightspeed com tecnologia SUPERSTRIKE inovadora",
  "Rato Logitech Pro X2 Superstrike Lightspeed com sensor HERO 2 preciso",
  "Rato Logitech Pro X2 Superstrike Lightspeed com ligação LIGHTSPEED sem fios estável",
  "Rato Logitech Pro X2 Superstrike Lightspeed com design resistente",
  "Rato Logitech Pro X2 Superstrike Lightspeed personalizável através do G HUB",
];

// Also deep-clean name/desc/tech of any leftover diacritic VN fragments.
const VIET_TOKENS = [
  "công",
  "nghệ",
  "đột",
  "phá",
  "kết",
  "nối",
  "không",
  "dây",
  "ổn",
  "định",
  "cảm",
  "biến",
  "chính",
  "xác",
  "có",
  "thể",
  "tùy",
  "chỉnh",
  "qua",
  "thiết",
  "kế",
  "bền",
  "bỉ",
  "siêu",
  "tốc",
  "nổi",
  "bật",
  "hàng",
  "đầu",
  "của",
];
for (const tok of VIET_TOKENS) {
  const re = new RegExp(`(?<![\\p{L}])${tok}(?![\\p{L}])`, "gu");
  if (re.test(rec.description))
    rec.description = rec.description.replace(re, "");
}
// Clean double spaces left behind
for (const field of [rec.description, rec.name, rec.technicalDescription]) {
  field.replace(/  +/g, " ");
}
rec.description = rec.description.replace(/  +/g, " ").replace(/\n +/g, "\n");
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
    "Resolução",
    "resolução",
    "variável",
    "durável",
    "Ligação",
    "fios",
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
  for (const [lang, tt] of Object.entries(langs)) {
    if (!tt || !tt.name) continue;
    const all = [
      tt.name,
      tt.description,
      tt.technicalDescription,
      Object.values(tt.specs || {}).join(" "),
      (tt.imageAlts || []).join(" "),
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
