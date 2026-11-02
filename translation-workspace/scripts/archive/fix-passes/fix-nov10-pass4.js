// Fix nov10 pass4 (final token alignment):
//  - c728: source description has ZERO "F87" — my generator injected 8
//    (from name-based boilerplate). Validator requires parity → strip extra
//    "F87" so desc count = 0, and the name keeps its 1 (matching source name).
//    Also "missing_technical_token:f" means a lowercase "f" token in the
//    source name isn't in the translation... source name has "F873W" —
//    validator extracts token "f"? It's likely from "f" in "F87 TM f"? No —
//    the token regex picks standalone letters. The missing "f" likely comes
//    from "fullscreen"/"fn"? Simplest: keep name with "F873W" and check.
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
  const srcDescF87 = 0; // verified
  // remove all "F87" from description (keep "F873W" — distinct token)
  const before = (t.description.match(/F87(?![0-9W])/g) || []).length;
  if (before) {
    t.description = t.description.replace(/F87(?![0-9W])/g, "AULA");
  }
  // remove injected "AULA F87 TM"→already replaced; ensure parity now zero
  if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
    hand[rec.productId][rec.targetLang].description = t.description;
  console.log(rec.targetLang, "removed F87:", before);
  n++;
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
