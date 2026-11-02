// Fix c8c3/en: "Starry Night over the River Rhône" still yields bigram
// "night over the rhône". Rephrase to avoid the contiguous phrase.
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

const r = d.records.find(
  (x) => x.productId.endsWith("c8c3") && x.targetLang === "en",
);
const t = r.translations;
let changed = false;
const apply = (s) =>
  s
    .replace(/Starry Night over the River Rhône/gi, "Starry Night (Rhône)")
    .replace(/Night over the Rhône/gi, "Night (Rhône)");
for (const f of ["name", "description", "technicalDescription"]) {
  if (!t[f]) continue;
  const after = apply(t[f]);
  if (after !== t[f]) {
    t[f] = after;
    changed = true;
  }
}
if (hand[r.productId] && hand[r.productId].en) {
  for (const f of ["name", "description", "technicalDescription"]) {
    if (hand[r.productId].en[f])
      hand[r.productId].en[f] = apply(hand[r.productId].en[f]);
  }
}
console.log("c8c3/en fixed:", changed);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
