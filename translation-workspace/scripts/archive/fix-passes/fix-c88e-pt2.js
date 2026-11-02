// Fix c88e/pt hardened: source from nov06c import might not contain this pid
// (nov06d uses its own export). Pull source alts from the nov06d sources txt
// instead, which always matches the current batch.
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
if (!rec) {
  console.log("c88e pt missing");
  process.exit(1);
}

// Source alts from sources-for-translation-next.txt (current batch)
const txt = fs.readFileSync(
  path.join(WS, "data", "sources-for-translation-next.txt"),
  "utf8",
);
const block = txt
  .split("===== PRODUCT ")
  .find((b) => b.slice(0, 24).endsWith("c88e"));
let srcAlts = [];
if (block) {
  srcAlts = [...("===== PRODUCT " + block).matchAll(/  \[(\d+)\] (.*)/g)]
    .filter((m) => !/type=/.test(m[2]) && m[2].trim())
    .map((m) => m[2]);
}
console.log("srcAlts:", JSON.stringify(srcAlts));

const VN_MAP = [
  [/ có cảm biến /g, " com sensor "],
  [/ có Polling Rate /g, " com Polling Rate "],
  [/ chính xác/g, " preciso"],
  [/ siêu tốc/g, " ultra rápido"],
  [/ có thiết kế /g, " com design "],
  [/ siêu nhẹ/g, " ultra leve"],
  [/ có kết nối /g, " com ligação "],
  [/ ổn định/g, " estável"],
  [/ bật tắt chuyển đổi linh hoạt/g, " de troca flexível"],
  [/Ligação ligação/g, "Ligação"],
  [/não fio/g, "sem fios"],
];
function transAlt(text) {
  let out = text;
  for (const [re, rep] of VN_MAP) out = out.replace(re, rep);
  return out;
}
if (srcAlts.length) rec.imageAlts = srcAlts.map((a) => transAlt(a));
rec.name = rec.name.replace(/não fio/g, "sem fios");
rec.description = rec.description.replace(/não fio/g, "sem fios");
rec.technicalDescription = rec.technicalDescription.replace(
  /Ligação ligação/g,
  "Ligação",
);
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");

// Verify all clean
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
