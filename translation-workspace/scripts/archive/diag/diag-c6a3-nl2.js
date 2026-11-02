// Diagnose where "để asus tuf gaming" still lives in c6a3/nl — check source
// and translation separately, and also source.name.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06e.json"),
    "utf8",
  ),
);
const rec = importData.records.find(
  (r) => r.productId.endsWith("c6a3") && r.targetLang === "nl",
);
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\s+/g, " ")
    .toLowerCase();
const nd = norm(rec.source.description);
const needle = norm("để asus tuf gaming");
let i = 0,
  c = 0;
while ((i = nd.indexOf(needle, i)) !== -1) {
  c++;
  i += needle.length;
}
console.log("source matches:", c);
const nt = norm(rec.translations.description);
let j = 0,
  c2 = 0;
while ((j = nt.indexOf(needle, j)) !== -1) {
  c2++;
  j += needle.length;
}
console.log("translation matches:", c2);
if (c2) {
  const idx = nt.indexOf(needle);
  console.log(
    JSON.stringify(
      rec.translations.description.slice(Math.max(0, idx - 200), idx + 130),
    ),
  );
}
console.log("source name:", JSON.stringify(rec.source.name.slice(0, 100)));
