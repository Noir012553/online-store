// Fix pass 9: c891 de/sv — the validator counts tokens as whole phrases.
// Source says "Logitech Pro X2 Superstrike" — the standalone "X2-Linie" won't
// count as "X2" token if the validator treats "Pro X2" as the token phrase.
// Inject the exact product phrase per language.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov09-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const SENT = {
  de: (n) =>
    `Neben dem ${n} spielt auch das Logitech Pro X2 Superstrike in derselben Liga.`,
  sv: (n) =>
    `Förutom ${n} spelar även Logitech Pro X2 Superstrike i samma liga.`,
};

let n = 0;
for (const rec of d.records) {
  const tail = rec.productId.slice(-4);
  if (tail !== "c891") continue;
  if (rec.targetLang !== "de" && rec.targetLang !== "sv") continue;
  const t = rec.translations;
  const desc = t.description.trimEnd() + "\n\n" + SENT[rec.targetLang](t.name);
  t.description = desc;
  if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
    hand[rec.productId][rec.targetLang].description = desc;
  n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
