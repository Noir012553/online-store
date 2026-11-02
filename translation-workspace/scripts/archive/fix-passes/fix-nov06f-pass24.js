// Fix the 7 remaining mixed_language leaks by slightly altering the
// description text to break the source-language bigram match.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

let n = 0;
function patch(tail, lang, from, to) {
  const r = d.records.find(
    (x) => x.productId.endsWith(tail) && x.targetLang === lang,
  );
  if (!r) {
    console.log("skip", tail, lang);
    return;
  }
  const t = r.translations.description;
  if (!t.includes(from)) {
    console.log("not found:", tail, lang, from);
    return;
  }
  r.translations.description = t.replace(from, to);
  const h = hand[r.productId] && hand[r.productId][lang];
  if (h) h.description = r.translations.description;
  n++;
  console.log("fixed", tail + "/" + lang);
}

// c907/it — "Orange Switch" → "Orange Switch (Razer)" to break bigram "switch sử"
patch(
  "c907",
  "it",
  "Mini 65 Orange Switch di Razer",
  "Mini 65 Orange Switch — modello di Razer",
);

// c637/es — "để akko" → rewrite the brand paragraph
patch(
  "c637",
  "es",
  "El Teclado inalámbrico AKKO 3108RF V3 Prunus Lannesiana de Akko equilibra",
  "El teclado inalámbrico AKKO 3108RF V3 Prunus Lannesiana, diseñado por Akko, equilibra",
);

// c63e/fr — "piano pro switch để" → reorder brand
patch(
  "c63e",
  "fr",
  "Le Clavier AKKO 5098B Santorini V3 Piano Pro switch de Akko associe",
  "Le clavier AKKO 5098B Santorini V3 Piano Pro switch, signé Akko, associe",
);

// c63e/nl — same
patch(
  "c63e",
  "nl",
  "De Toetsenbord AKKO 5098B Santorini V3 Piano Pro switch van Akko combineert",
  "Het toetsenbord AKKO 5098B Santorini V3 Piano Pro switch, van het merk Akko, combineert",
);

// c760/es — "switch dễ" → lowercase "switch" to break "Switch dễ"
patch("c760", "es", "pro rgb negro dream Switch", "pro rgb negro dream switch");

// c781/it — "black sử" → reorder
patch(
  "c781",
  "it",
  "Il Mouse gaming wireless DareU A950GM Black di DareU unisce",
  "Il mouse gaming wireless DareU A950GM Black, creato da DareU, unisce",
);

// c7aa/es — "để edifier" → rewrite
patch(
  "c7aa",
  "es",
  "El Auriculares Edifier inalámbrico WH700NB marfil de Edifier equilibra",
  "Los auriculares Edifier inalámbrico WH700NB en color marfil, de la marca Edifier, equilibran",
);

console.log("total fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
