// Fix pass 7: two precise fixes.
//  1. c6be/it: the leak bigram spans source NAME "…Wireless White sử dụng…" →
//     our description keeps "...Wireless White" adjacent to next Italian word.
//     Source-side phrase is "iii wireless white sử" (name→desc cross-boundary).
//     Fix: in Italian translation, write "Impact III Wireless — Bianco" so
//     "white" bigram no longer followed by anything matching "sử"... Actually
//     the bigram is in SOURCE: "...Wireless White sử". The validator finds
//     that same bigram in OUR TRANSLATION — our translation literally has
//     "III Wireless White" and the NEXT WORD must be "sử"? No — it can't be.
//     Real cause: validator scans SOURCE bigrams then searches TRANSLATION.
//     Bigram "wireless white sử" needs to appear verbatim in translation —
//     impossible. UNLESS our translation contains "...White sử..." literally.
//     Check the raw bytes near the match.
//  2. c6c0/en alt.5: VN words leaked ("Chuột", "và") — translate.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06c.json",
);
const importData = load(IMPORT);
const rec = importData.records.find(
  (r) => r.productId.endsWith("c6be") && r.targetLang === "it",
);
const desc = rec.translations.description;
const needle = "iii wireless white su".slice(0, 0) || "";
// locate the leak phrase precisely, case/accent-insensitive
const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
const nd = norm(desc);
const j = nd.indexOf("iii wireless white su");
console.log("idx:", j);
if (j >= 0) console.log(JSON.stringify(desc.slice(j, j + 120)));
