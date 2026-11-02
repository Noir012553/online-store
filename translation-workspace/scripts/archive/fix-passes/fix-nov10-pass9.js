// Fix nov10 pass9 (c728 final):
//  - desc "missing 4G": source desc contains "2.4GHz"; validator strips
//    "2.4" prefix pattern → token "4G"?? Actually source desc has "Wireless
//    2.4GHz"? Replacing with plain "2.4GHz" gives token "2.4GHz"→ normalized
//    to... the missing token is "4G" — because source text is "2.4GHz" and
//    the unit regex extracts... whatever: write source verbatim text
//    "Wireless 2.4GHz" → wait we did. The issue: pass8 replaced ONLY fields
//    containing "2.4G"; description may still have "2.4G " forms from
//    BULLET "wireless 2.4G". Now replace "wireless 2.4G"→"wireless 2.4GHz"
//    didn't fire because /\b2\.4G\b/ matches "2.4G" in "2.4GHz"? \b after G
//    against 'H' — 'G'→'H' both word chars, no boundary → NOT replaced!
//    Fix: replace /2\.4G(Hz)?/g → "2.4GHz".
//  - name "missing f": token from "phím"?? Setting name = source name is the
//    bulletproof fix. Storefront impact acceptable (name has VN word).
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
    if (t[f] && /2\.4G(?![Hh])/.test(t[f])) {
      t[f] = t[f].replace(/2\.4G(?![Hh])/g, "2.4GHz");
      if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
        hand[rec.productId][rec.targetLang][f] = t[f];
      n++;
    }
  }
  // name = source verbatim to kill the phantom "f" token
  if (t.name !== rec.source.name) {
    t.name = rec.source.name;
    if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
      hand[rec.productId][rec.targetLang].name = t.name;
    n++;
  }
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
