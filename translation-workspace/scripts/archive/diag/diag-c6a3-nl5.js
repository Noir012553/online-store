// Final nl patch for c6a3: the remaining leak is "để asus tuf gaming" — a
// Vietnamese connector "để" surviving in the nl draft right before the
// brand token. Rewrite that phrase into Dutch and re-verify with the real
// validator.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);

const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const save = (p, d) =>
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n", "utf8");

const file = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const data = load(file);
const entry = data.records
  ? data.records.find(
      (r) => r.productId.endsWith("c6a3") && r.targetLang === "nl",
    )
  : data["6ad0cf0b0069aece85a8c6a3"]?.nl;

if (!entry) {
  console.error("entry not found");
  process.exit(1);
}
const getDesc = () =>
  entry.translations ? entry.translations.description : entry.description;
const setDesc = (v) =>
  entry.translations
    ? (entry.translations.description = v)
    : (entry.description = v);

let desc = getDesc();
const norm = (s) => s.toLowerCase();
let idx = norm(desc).indexOf("để asus tuf gaming");
if (idx < 0) idx = norm(desc).indexOf("de asus tuf gaming");
console.log("found at:", idx);
if (idx >= 0) {
  console.log(
    "ctx:",
    JSON.stringify(desc.slice(Math.max(0, idx - 180), idx + 140)),
  );
  // Show the sentence so we can hand-rewrite it properly.
} else {
  console.log("phrase not present; checking all 'de ' occurrences near ASUS:");
  const re = /\bde\b[^.!?]{0,60}/gi;
  let m;
  while ((m = re.exec(desc))) {
    if (/asus|tuf/i.test(m[0])) console.log("hit:", JSON.stringify(m[0]));
  }
}
// Report current validator status
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06e.json"),
    "utf8",
  ),
);
const rec = importData.records.find(
  (r) => r.productId.endsWith("c6a3") && r.targetLang === "nl",
);
const leak = validator.checkSourceLanguageLeak(
  rec.source.description,
  rec.translations.description,
  "nl",
  "product_description",
);
console.log("validator leak:", leak && leak.phrase);
