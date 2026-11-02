// Leak "switch dễ" is likely an artifact of validator source-vs-name — check
// the source NAME for context and determine the fix (usually it leaks because
// the source name "Chuột không dây" and the SOURCE DESCRIPTION contains the
// phrase near "Switch dễ ... làm việc" which appears identical in translation
// when I kept some phrase verbatim). Print the source description snippet.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const rec = d.records.find(
  (r) => r.productId.endsWith("c770") && r.targetLang === "fr",
);
const src = rec.source.description;
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const nd = norm(src);
let j = 0;
const needle = "switch de";
while ((j = nd.indexOf(needle, j)) !== -1) {
  console.log(
    "SRC ctx:",
    JSON.stringify(src.slice(Math.max(0, j - 150), j + 100)),
  );
  j += needle.length;
}
// also translation normalized positions
const trDesc = rec.translations.description;
const nt = norm(trDesc);
j = 0;
const ntHits = [];
while ((j = nt.indexOf(needle, j)) !== -1) {
  ntHits.push(j);
  j += needle.length;
}
console.log("translation hits:", ntHits.length);
for (const h of ntHits)
  console.log(
    "TR ctx:",
    JSON.stringify(trDesc.slice(Math.max(0, h - 150), h + 100)),
  );
