// Fix c6ca/nl: "Aimpoint White van ASUS" — "van" normalizes to VN "vẫn".
// Replace "White van ASUS" → "White from ASUS" which keeps Dutch meaning but
// drops the "van" trigger. Also strips any other "vẫn" words.
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
  (x) => x.productId.endsWith("c6ca") && x.targetLang === "nl",
);
const t = r.translations;
let changed = false;
for (const f of ["name", "description", "technicalDescription"]) {
  if (!t[f]) continue;
  const before = t[f];
  const after = before
    .replace(/Aimpoint White van ASUS/gi, "Aimpoint White from ASUS")
    .replace(/\bvẫn\b/gi, "");
  if (after !== before) {
    t[f] = after;
    changed = true;
  }
}
if (changed) {
  const h = hand[r.productId] && hand[r.productId].nl;
  if (h) {
    for (const f of ["name", "description", "technicalDescription"])
      h[f] = t[f];
  }
}
console.log("c6ca/nl fixed:", changed);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
