// Fix the 3 pending nov09 c645 slots (fr/pt/sv): validator requires the
// adjacent bigram "AKKO 5108" in name and description, but the target-language
// word was inserted between ("AKKO sans fil 5108", "AKKO sem fios 5108",
// "AKKO trådlös 5108"). Reorder so "AKKO 5108" is adjacent everywhere.
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

const SWAPS = {
  fr: [["AKKO sans fil 5108", "AKKO 5108 sans fil"]],
  pt: [["AKKO sem fios 5108", "AKKO 5108 sem fios"]],
  sv: [["AKKO trådlös 5108", "AKKO 5108 trådlös"]],
};
let fixed = 0;
for (const r of d.records) {
  if (r.productId.slice(-4) !== "c645") continue;
  const swaps = SWAPS[r.targetLang];
  if (!swaps) continue;
  const t = r.translations;
  for (const [from, to] of swaps) {
    for (const key of ["name", "description", "technicalDescription"]) {
      if (typeof t[key] === "string" && t[key].includes(from)) {
        const n = t[key].split(from).length - 1;
        t[key] = t[key].split(from).join(to);
        fixed += n;
      }
    }
    if (t.specs && typeof t.specs === "object") {
      for (const k of Object.keys(t.specs)) {
        if (typeof t.specs[k] === "string" && t.specs[k].includes(from)) {
          t.specs[k] = t.specs[k].split(from).join(to);
          fixed++;
        }
      }
    }
  }
  if (hand[r.productId] && hand[r.productId][r.targetLang]) {
    hand[r.productId][r.targetLang].name = t.name;
    hand[r.productId][r.targetLang].description = t.description;
    hand[r.productId][r.targetLang].technicalDescription =
      t.technicalDescription;
  }
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("swaps applied:", fixed);
