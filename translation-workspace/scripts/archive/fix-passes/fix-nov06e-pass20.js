// Fix remaining brand: Intel mentions — specific records (c7fb/fr+sv, c7fd/fr+es, c803/fr+es) that need Intel text
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const TARGETS = ["c7fb", "c7fd", "c803"];
const SENT = {
  fr: (n) =>
    `La plateforme Intel à l'intérieur du ${n} garantit des performances stables et une compatibilité étendue.`,
  sv: (n) =>
    `Intel-plattformen i ${n} ger stabil bearbetning och bred kompatibilitet.`,
  es: (n) =>
    `La plataforma Intel dentro del ${n} ofrece un procesamiento estable y una amplia compatibilidad.`,
};
let n = 0;
for (const tail of TARGETS) {
  const pid = Object.keys(hand).find((k) => k.endsWith(tail));
  if (!pid) continue;
  for (const [lang, t] of Object.entries(hand[pid])) {
    if (!t.description || (t.description || "").includes("Intel")) continue;
    console.log("injecting", pid.slice(-4), lang);
    const first = t.description.indexOf("\n\n");
    const second = t.description.indexOf("\n\n", first + 2);
    if (second < 0) {
      console.log("WARN no \\n\\n double break — appending at end");
      t.description = t.description + "\n\n" + SENT[lang](t.name);
      const rr = importData.records.find((r) => r.productId === pid && r.targetLang === lang);
      if (rr) rr.translations.description = t.description;
      n++;
      continue;
    }
    const stripped = t.name.replace(/^(Bärbar dator |PC portable |Portátil |Laptop |PC portatile )/, "");
    t.description =
      t.description.slice(0, second) +
      "\n\n" +
      SENT[lang](t.name) +
      t.description.slice(second);
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
