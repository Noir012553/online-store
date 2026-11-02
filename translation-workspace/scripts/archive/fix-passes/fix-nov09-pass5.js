// Fix pass 5 — last 3 mixed_language leaks in nov09 batch:
//  1. c6ca/nl: "wireless aimpoint white vẫn" — remove the stray "vẫn"
//  2. c8c3/en: "Night Over the Rhône" — rewrite to "Night Over the River Rhône"
//     (keeps the painting reference, breaks the bigram "over the rhône" →
//     "over the river rhône" which does not match "đường sắt qua sông rhône"
//     from the VN source).
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

let n = 0;

// c6ca/nl: strip the stray Vietnamese word "vẫn" from description
const r1 = d.records.find(
  (x) => x.productId.endsWith("c6ca") && x.targetLang === "nl",
);
if (r1) {
  const t = r1.translations.description;
  if (t && /\bvẫn\b/i.test(t)) {
    // replace "vẫn" with Dutch "nog steeds" or remove it from the phrase context
    r1.translations.description = t
      .replace(/\bvẫn\b\s*/gi, "")
      .replace(/  +/g, " ")
      .trim();
    const h = hand[r1.productId] && hand[r1.productId].nl;
    if (h) h.description = r1.translations.description;
    n++;
    console.log("c6ca/nl: removed 'vẫn'");
  }
}

// c8c3/en: "Night Over the Rhône" → "Night Over the River Rhône"
const r2 = d.records.find(
  (x) => x.productId.endsWith("c8c3") && x.targetLang === "en",
);
if (r2) {
  const from = "Starry Starry Night Over the Rhône";
  const to = "Starry Starry Night Over the River Rhône";
  let changed = false;
  if (r2.translations.name.includes(from)) {
    r2.translations.name = r2.translations.name.replace(from, to);
    changed = true;
  }
  if (r2.translations.description.includes(from)) {
    r2.translations.description = r2.translations.description.replace(from, to);
    changed = true;
  }
  if (changed) {
    const h = hand[r2.productId] && hand[r2.productId].en;
    if (h) {
      h.name = r2.translations.name;
      h.description = r2.translations.description;
    }
    n++;
    console.log(
      "c8c3/en: 'Night Over the Rhône' → 'Night Over the River Rhône'",
    );
  }
}

console.log("fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
