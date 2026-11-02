// Fix nov10 pass7 (final c728):
//  - desc: "2.4GHz" unexpected → source says "2.4G"; replace all "2.4GHz"
//    with "2.4G" in description + tech.
//  - name: now name == source verbatim. "missing f" must come from TECH or
//    empty-field compare? diag said name/tech... checkTechnicalTokens(src.name,
//    tr.name) passes when strings identical. Re-run diag after 2.4GHz fix.
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
  for (const f of ["description", "technicalDescription"]) {
    if (t[f] && t[f].includes("2.4GHz")) {
      t[f] = t[f].replace(/2\.4GHz/g, "2.4G");
      if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
        hand[rec.productId][rec.targetLang][f] = t[f];
      n++;
    }
  }
}
console.log("fields fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
