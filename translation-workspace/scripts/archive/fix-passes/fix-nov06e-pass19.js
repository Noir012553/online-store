// Fix remaining records: inject Intel brand sentences per specific language.
// Targets confirmed by diag: Intel missing in all of them.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));

const SENT = {
  sv: (n) =>
    `Intel-plattformen i ${n} ger stabil bearbetning och bred kompatibilitet.`,
  fr: (n) =>
    `La plateforme Intel à l'intérieur du ${n} garantit des performances stables et une compatibilité étendue.`,
  es: (n) =>
    `La plataforma Intel dentro del ${n} ofrece un procesamiento estable y una amplia compatibilidad.`,
  pt: (n) =>
    `A plataforma Intel dentro do ${n} assegura processamento estável e ampla compatibilidade.`,
  de: (n) =>
    `Die Intel-Plattform im ${n} sorgt für stabile Verarbeitung und breite Kompatibilität.`,
  it: (n) =>
    `La piattaforma Intel all'interno del ${n} garantisce un'elaborazione stabile e un'ampia compatibilità.`,
};
const TAILS = ["c7fb", "c803", "c8b3", "c8c4", "c8c5", "c8c8", "c8db"];
let n = 0;
for (const tail of TAILS) {
  const pid = Object.keys(hand).find((k) => k.endsWith(tail));
  if (!pid) {
    console.log("MISS", tail);
    continue;
  }
  for (const [lang, t] of Object.entries(hand[pid])) {
    if (!t.description || t.description.includes("Intel")) continue;
    const first = t.description.indexOf("\n\n");
    const second = t.description.indexOf("\n\n", first + 2);
    if (second < 0) continue;
    const sentence = SENT[lang] ? SENT[lang](t.name) : null;
    if (!sentence) continue;
    t.description =
      t.description.slice(0, second) +
      "\n\n" +
      sentence +
      t.description.slice(second);
    // sync to import record
    const rec = importData.records.find(
      (r) => r.productId === pid && r.targetLang === lang,
    );
    if (rec) rec.translations.description = t.description;
    n++;
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
fs.writeFileSync(IMPORT, JSON.stringify(importData, null, 2), "utf8");
console.log("Intel injected:", n);
