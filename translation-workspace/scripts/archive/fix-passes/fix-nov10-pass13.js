// Fix nov10 pass13:
//  - c728 tech: restore "2.4GHz" (source verbatim) — pass11 wrongly reverted.
//  - c728 name: inspect source name tail to decide the "f"-prefix workaround.
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
  for (const f of ["technicalDescription", "description"]) {
    if (t[f] && /2\.4G(?![Hh])/.test(t[f])) {
      t[f] = t[f].replace(/2\.4G(?![Hh])/g, "2.4GHz");
      if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
        hand[rec.productId][rec.targetLang][f] = t[f];
      n++;
    }
  }
}
console.log("fields fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");

// print source name tail for the prefix decision
const r = d.records.find((x) => x.productId.endsWith("c728"));
console.log("SOURCE NAME:", JSON.stringify(r.source.name));
console.log("SOURCE NAME TAIL:", JSON.stringify(r.source.name.slice(-30)));
