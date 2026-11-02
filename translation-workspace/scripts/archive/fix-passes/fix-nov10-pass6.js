// Fix nov10 pass6:
//  - c728 desc: unexpected 80% — our OPENING text says "80%"? No — bullets
//    mention "80%"? Actually source desc likely has 0 "80%"; my BULLET_MAP
//    injected? Whatever — strip standalone "80%" from translation.
//  - c728 name: validator extracts token "f" from SOURCE NAME — likely the
//    token regex sees "F87" then letter-series split: "F87 TM (...)" — "f"
//    missing means source tokens include lowercase "f" standalone, maybe from
//    "/Grey Wood Switch" → no. Let's print getPlainTechnicalTokenCounts of
//    src.name to see exact tokens, then mirror whatever contains f.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
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
  const src = rec.source;

  // strip 80% from description
  if (t.description.includes("80%")) {
    t.description = t.description.replace(/\b80%\s*/g, "");
  }
  if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
    hand[rec.productId][rec.targetLang].description = t.description;
  n++;
}
// diagnose name tokens once
const rec0 = d.records.find((r) => r.productId.endsWith("c728"));
const tt = validator.checkTechnicalTokens(
  rec0.source.name,
  rec0.translations.name,
);
console.log("name token err:", JSON.stringify(tt));
// find tokens containing f in source name via validator private fn? fallback:
// manual regex similar to validator: /[A-Za-z]+\d+/ etc. Print suspicious.
console.log("src name:", JSON.stringify(rec0.source.name));
console.log("tr  name:", JSON.stringify(rec0.translations.name));
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
