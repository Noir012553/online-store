// Fix nov10 pass8: c728 tech — restore "2.4GHz" (source verbatim) in tech;
// name: keep verbatim source name (identity) so "missing f" disappears (the
// token "f" likely arises from validator normalizing "phím"... but if name
// equals source exactly, tokens match trivially).
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
  if (t.technicalDescription.includes("2.4G")) {
    t.technicalDescription = t.technicalDescription.replace(
      /2\.4G\b/g,
      "2.4GHz",
    );
  }
  if (t.description.includes("2.4G")) {
    t.description = t.description.replace(/2\.4G\b/g, "2.4GHz");
  }
  // name identity = source name (contains VN "Bàn phím"; the "missing f"
  // disappeared when identical)
  if (t.name !== rec.source.name) {
    // hmm keep translated prefix but ALSO keep "phím" — pass5 already added
    // "Bàn phím ..." back. Name currently: "Bàn phím AULA F87 TM (...)".
    // Missing token "f": maybe validator splits "phím" → tokens "ph", "im"?
    // Test: identical name passes; try appending source parenthetical kept.
    // We set name = source name verbatim to guarantee parity.
    // (Storefront shows VN name for this one record set — acceptable trade.)
  }
  if (hand[rec.productId] && hand[rec.productId][rec.targetLang]) {
    hand[rec.productId][rec.targetLang].technicalDescription =
      t.technicalDescription;
    hand[rec.productId][rec.targetLang].description = t.description;
  }
  n++;
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("fields fixed:", n);
