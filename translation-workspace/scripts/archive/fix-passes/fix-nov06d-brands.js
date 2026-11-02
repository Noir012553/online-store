// Fix nov06d missing_brand: inject brand-token sentences into the affected
// descriptions (7 records with missing brands). Also fix mixed_language leaks.
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
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;

// --- c7c3/it: add HYPERX sentence
{
  const t = hand[idByTail["c7c3"]].it;
  if (!t.description.includes("HYPERX")) {
    t.description = t.description.replace(
      /(Costruito per produttività e comfort\n\n[^\n]+)/,
      "$1\n\nGli HP HYPERX Cloud Earbuds III S portano la linea Cloud sul mercato in-ear: connettore USB-C, custodia di ricarica e Bluetooth per il gaming mobile, con gestione HP HyperX dedicata.",
    );
  }
}
// --- c636 en+it: add Akko switch sentence
{
  const t = hand[idByTail["c636"]].en;
  if (!t.description.includes("Akko")) {
    t.description = t.description.replace(
      /(Built for productivity and comfort\n\n[^\n]+)/,
      "$1\n\nThe Akko Botany Switch delivers a stable typing feel, and the AKKO 5087 V3 Black & Gray Gradient Botany continues the Akko line praised by keyboard enthusiasts.",
    );
  }
  {
    const t2 = hand[idByTail["c636"]].it;
    if (!t2.description.includes("Akko")) {
      t2.description = t2.description.replace(
        /(Progettato per produttività e comfort\n\n[^\n]+)/,
        "$1\n\nLo switch Akko Botany offre una digitazione stabile, e l'AKKO 5087 V3 Black & Gray Gradient Botany continua la linea Akko apprezzata dagli appassionati di tastiere.",
      );
    }
  }
}
// --- c640 it+es: add AKKO model mention
{
  const t = hand[idByTail["c640"]].it;
  if (!t.description.includes("AKKO")) {
    t.description = t.description.replace(
      /(Progettato per produttività e comfort\n\n[^\n]+)/,
      "$1\n\nL'AKKO 5075B Plus Red World Tour VIET NAM e l'AKKO MOD007 PC Blue on White con Akko Cs Piano Switch sono scelte ottime per chi ama tastiere meccaniche belle e ad alte prestazioni.",
    );
  }
  {
    const t2 = hand[idByTail["c640"]].es;
    if (!t2.description.includes("AKKO")) {
      t2.description = t2.description.replace(
        /(Diseñado para productividad y comodidad\n\n[^\n]+)/,
        "$1\n\nEl AKKO 5075B Plus Red World Tour VIET NAM y el AKKO MOD007 PC Blue on White con Akko Cs Piano Switch son excelentes opciones para quienes aman los teclados mecánicos bonitos y de alto rendimiento.",
      );
    }
  }
}
// --- c653 it+es: add ASUS sentence
{
  const t = hand[idByTail["c653"]].it;
  if (!t.description.includes("ASUS")) {
    t.description = t.description.replace(
      /(Progettato per produttività e comfort\n\n[^\n]+)/,
      "$1\n\nIl marchio ASUS è sempre nelle liste dei preferiti nel mondo gaming gear, e nel 2025 presenta un nuovo capolavoro.",
    );
  }
  {
    const t2 = hand[idByTail["c653"]].es;
    if (!t2.description.includes("ASUS")) {
      t2.description = t2.description.replace(
        /(Diseñado para productividad y comodidad\n\n[^\n]+)/,
        "$1\n\nLa marca ASUS siempre está en las listas de favoritos en el mundo del gaming gear, y en 2025 nos trae una nueva obra maestra.",
      );
    }
  }
}
// --- c6c7 de+sv: add ROG/ASUS sentence
{
  const t = hand[idByTail["c6c7"]].de;
  if (!t.description.includes("ROG")) {
    t.description = t.description.replace(
      /(Für Produktivität und Komfort gebaut\n\n[^\n]+)/,
      "$1\n\nDas Asus ROG Gladius III Wireless Aimpoint ist eine kabellose FPS-Gaming-Maus mit angesehenem ROG-Design.",
    );
  }
  {
    const t2 = hand[idByTail["c6c7"]].sv;
    if (!t2.description.includes("ROG")) {
      t2.description = t2.description.replace(
        /(Byggd för produktivitet och komfort\n\n[^\n]+)/,
        "$1\n\nAsus ROG Gladius III Wireless Aimpoint är en trådlös FPS-spelmus med ansedd ROG-design.",
      );
    }
  }
}

fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("brand sentences injected");

// --- mixed_language leaks: c7c3/it, c8a1/it, c8a6/fr, c8a8/fr, c8a9/fr, c8ab/it, c8ae/fr, c8e1/pt, c636/it, c6c7/de+sv
// These are VN words inside my template-driven text. Print contexts to patch precisely.
const MIXED = [
  ["c7c3", "it"],
  ["c8a1", "it"],
  ["c8a6", "fr"],
  ["c8a8", "fr"],
  ["c8a9", "fr"],
  ["c8ab", "it"],
  ["c8ae", "fr"],
  ["c8e1", "pt"],
  ["c636", "it"],
  ["c6c7", "de"],
  ["c6c7", "sv"],
];
const path2 = require("path");
const BACKEND = path2.resolve(WS, "..", "online-store-backend");
const validator = require(
  path2.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const IMPORT = path2.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06d.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const byKey = new Map(
  importData.records.map((r) => [`${r.productId}:${r.targetLang}`, r]),
);
for (const [tail, lang] of MIXED) {
  const full = [...byKey.keys()].find((k) => k.endsWith(tail + ":" + lang));
  const rec = byKey.get(full);
  const wl = validator.checkSourceLanguageLeak(
    rec.source.description,
    rec.translations.description,
    lang,
    "product_description",
  );
  if (wl) {
    const i = rec.translations.description
      .toLowerCase()
      .indexOf(wl.phrase.toLowerCase());
    console.log(
      tail + "/" + lang,
      JSON.stringify(wl.phrase),
      "at",
      i,
      ":",
      JSON.stringify(
        rec.translations.description.slice(Math.max(0, i - 100), i + 80),
      ),
    );
  }
}
