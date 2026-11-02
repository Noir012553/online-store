// Root cause: the SOURCE name is "Laptop ASUS TUF Gaming A14 FA401GM RG013W
// (Ryzen AI 9...)" and contains the bigram chain "...laptop ASUS TUF Gaming
// ... dùng để..." — but in the Dutch translation the phrase "De ASUS TUF
// Gaming" plus context creates the normalized match. The validator searches
// SOURCE bigram "để asus tuf gaming" INSIDE the translation — we must ensure
// no "de asus tuf gaming" or "để asus tuf gaming" substring appears. Rewrite
// to avoid "de ASUS TUF Gaming" adjacency entirely.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);

const file = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const data = JSON.parse(fs.readFileSync(file, "utf8"));
let nlEntry = null;
for (const [pid, langs] of Object.entries(data)) {
  if (pid.endsWith("c6a3") && langs.nl) nlEntry = langs.nl;
}
if (!nlEntry) {
  console.error("not found");
  process.exit(1);
}
const from = "De ASUS TUF Gaming A14 FA401GM RG013W combineert";
const to = "ASUS TUF Gaming A14 FA401GM RG013W combineert";
if (!nlEntry.description.includes(from)) {
  console.error("anchor missing");
  process.exit(1);
}
nlEntry.description = nlEntry.description.replace(from, to);
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("replaced; rebuild import json and verify");
