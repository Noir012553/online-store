// Fix remaining: c774/e, c775/e, c776/e too_long; c786/fr also.
// Trim by removing paragraphs (head, last 2 kept) down below cap=source*3.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06d.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));

for (const [tail, lang] of [
  ["c774", "en"],
  ["c775", "en"],
  ["c776", "en"],
  ["c786", "fr"],
]) {
  const pid = Object.keys(hand).find((k) => k.endsWith(tail));
  if (!pid) {
    console.log(tail, "no hand");
    continue;
  }
  const t = hand[pid][lang];
  const rec = importData.records.find(
    (r) => r.productId === pid && r.targetLang === lang,
  );
  if (!rec) {
    console.log(tail, lang, "no import rec");
    continue;
  }
  const srcLen = rec.source.description.length;
  const maxLen = Math.floor(srcLen * 3);
  let guard = 0;
  while (t.description.length > maxLen && guard++ < 40) {
    const paras = t.description.split("\n\n");
    if (paras.length <= 3) break;
    let mi = 1,
      ml = 0;
    for (let i = 1; i < paras.length - 1; i++) {
      if (paras[i].length > ml) {
        ml = paras[i].length;
        mi = i;
      }
    }
    paras.splice(mi, 1);
    t.description = paras.join("\n\n");
  }
  console.log(
    tail,
    lang,
    "srcLen",
    srcLen,
    "maxLen",
    maxLen,
    "-> final",
    t.description.length,
  );
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
