// Fix c869/fr, c874/en, c875/en, c876/en descriptions still too_long
// (over 3× source desc length). Expand the trimming logic: MUST shrink to
// below 3× SOURCE length (recompute from source actual length), trimming
// head-middle-tail until passing. Print source lengths for reference.
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
  ["c869", "fr"],
  ["c874", "en"],
  ["c875", "en"],
  ["c876", "en"],
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
  const srcLen = rec.source.description.length;
  const maxLen = Math.floor(srcLen * 3);
  console.log(
    tail,
    lang,
    "srcLen",
    srcLen,
    "maxLen",
    maxLen,
    "curLen",
    t.description.length,
  );
  while (t.description.length > maxLen) {
    // Drop the longest middle paragraph each pass.
    const paras = t.description.split("\n\n");
    if (paras.length <= 3) break;
    // find longest middle
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
    console.log("  trimmed ->", t.description.length);
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
