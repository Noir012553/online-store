// False positive: phrase "de gaming" comes from "Ontdek de Gaming laptop".
// "Gaming laptop" is the normalized source name bigram "laptop gaming"? no —
// validator checks source bigrams in translation. Source name "Laptop gaming
// ASUS..." has bigram "laptop gaming"; our translation says "Gaming laptop"
// (reversed) — but where did the validator find a source phrase in "Ontdek
// de Gaming laptop"? The phrase must be "the gaming"? no, source is
// Vietnamese... "để gaming" normalized→"de gaming"; translation contains
// "de Gaming" inside "Ontdek de Gaming laptop" (article "de" + Gaming).
// Fix: rewrite the opening so "Gaming laptop" isn't preceded by "de":
// "Ontdek de gaming-laptop" → still contains it. Better: drop the article:
// "Ontdek Gaming laptop..." is bad Dutch. Use: "Maak kennis met de ASUS TUF
// Gaming A14 ..." — but then validator leak bigram "tuf gaming"? source has
// "TUF Gaming" too... source tokens also appear in translation legitimately.
// Actually simplest: swap name order back to source-like: keep translation
// name as source? No — better: replace "Gaming laptop" with "gamelaptop".
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
let nl = null;
for (const [pid, langs] of Object.entries(hand)) {
  if (pid.endsWith("c6a3") && langs.nl) nl = langs.nl;
}
if (!nl) {
  console.error("not found");
  process.exit(1);
}
const before = nl.name;
nl.name = nl.name.replace("Gaming laptop", "Gamelaptop");
nl.description = nl.description
  .replace("de Gaming laptop", "de Gamelaptop")
  .replace("De Gaming laptop", "De Gamelaptop")
  .replace("Gaming laptop", "Gamelaptop");
console.log("name:", before, "->", nl.name);
const hits = [...nl.description.matchAll(/gamelaptop/gi)].length;
console.log(
  "desc gamelaptop count:",
  hits,
  "| residual 'Gaming laptop':",
  /gaming laptop/i.test(nl.description),
);
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("saved");
