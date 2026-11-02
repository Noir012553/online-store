// Fix c770/fr — the leak "switch dễ" comes from a source bigram "switch dễ
// dàng" (hotswap sentence). The translation matched "switch d..." from "de
// DareU associe" — specifically the phrase "Switch de DareU" pattern? No —
// the validator uses WORD bigrams, so "switch dễ" (source) → "switch de" in
// the translation because French "de DareU associe" after "Le Clavier ... de
// DareU" → normalized "switch de"? Hmm — actually translation contains the
// SUBSTRING "switch de"? Not directly. But "Clavier DareU sans fil EK98 Pro
// RGB blanc Dream Switch\n\nLe Clavier DareU..." contains "Switch Le"... no
// "switch de".
// More likely the validator bigram search allows whitespace: "Switch de
// DareU" appears because we have "Switch\n\nLe" → no. Look again — the
// description contains "Le Clavier DareU sans fil EK98 Pro RGB blanc Dream
// Switch de DareU associe..." — YES! "...blanc Dream Switch de DareU..."
// contains "Switch de" — Vietnamese source bigram "Switch dễ" → French
// "Switch de" IS a normalized bigram match ("de" == "dễ" normalized "de").
// Fix: change "Switch de DareU associe" → "Switch de la marque DareU, qui
// associe" — wait that still has "Switch de". Use "...Dream Switch,
// conçu par DareU, associe...".
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const rec = d.records.find(
  (r) => r.productId.endsWith("c770") && r.targetLang === "fr",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
let frHand = null;
for (const [pid, langs] of Object.entries(hand)) {
  if (pid.endsWith("c770") && langs.fr) frHand = langs.fr;
}
const fix = (text) =>
  text
    .replace(
      "blanc Dream Switch de DareU associe",
      "blanc Dream Switch conçu par DareU, qui associe",
    )
    .replace(
      "blanc Dream Switch chez GearVN",
      "blanc Dream Switch chez GearVN",
    );
frHand.description = fix(frHand.description);
rec.translations.description = fix(rec.translations.description);
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
console.log("c770/fr fixed");
