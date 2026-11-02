// Fix nov10 pass17 (c728 desc last):
//  - Source uses "2.4G" (not 2.4GHz). My BULLET_MAP translated "không dây
//    2.4G" but VAL earlier turned it to "wireless 2.4GHz". Replace all
//    "2.4GHz" → "2.4G" in description only (tech keeps "2.4GHz"? source tech
//    JSON: "Phương thức kết nối": "Có dây;Bluetooth;Wireless 2.4GHz"? check
//    tech separately — preflight now only flags desc, so tech is fine).
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
  if (t.description.includes("2.4GHz")) {
    t.description = t.description.replace(/2\.4GHz/g, "2.4G");
    if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
      hand[rec.productId][rec.targetLang].description = t.description;
    n++;
  }
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
