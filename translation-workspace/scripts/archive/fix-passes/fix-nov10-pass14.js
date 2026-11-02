// Fix nov10 pass14 (c728 desc REAL fix):
//  - The TR description accidentally EMBEDS the raw source block text (tech
//    JSON + "DESCRIPTION (verbatim" markers) — the generator appended the
//    whole source blob. That's why tokens mismatch. Strip everything after
//    the bullets: description = OPENING + bullets only (up to first
//    "IMAGE_ALTS"/"TECH_DESCRIPTION"/"DESCRIPTION (verbatim" marker).
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov10.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov10-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c728") continue;
  const t = rec.translations;
  const cut = t.description.search(
    /\n\n"(?:Phương thức|P[hl]ương|METHOD|Connection)/,
  );
  if (cut > 0) {
    t.description = t.description.slice(0, cut).trimEnd();
    if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
      hand[rec.productId][rec.targetLang].description = t.description;
    n++;
  }
}
console.log("records cleaned:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
