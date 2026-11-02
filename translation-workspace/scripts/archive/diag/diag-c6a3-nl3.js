// Check exactly where the normalized bigram appears now in c6a3/nl.
const fs = require("fs");
const path = require("path");
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
const needle = norm("để asus tuf gaming");
const nt = norm(rec.translations.description);
let idxs = [];
let j = nt.indexOf(needle);
while (j !== -1) {
  idxs.push(j);
  j = nt.indexOf(needle, j + 1);
}
console.log("translation matches:", idxs.length);
for (const i of idxs)
  console.log(
    JSON.stringify(
      rec.translations.description.slice(
        Math.max(0, i - 120),
        i + needle.length + 80,
      ),
    ),
  );
// also name
const nn = norm(rec.translations.name || "");
console.log("name match:", nn.includes(needle));
