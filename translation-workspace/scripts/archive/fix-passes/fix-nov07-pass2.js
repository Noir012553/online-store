// Fix pass 2 (nov07): fix Asus→ASUS in description for c6a4 records; then re-import + approve them.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov07.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
let n = 0;
for (const rec of d.records) {
  const t = rec.translations;
  if (t.description && /\bAsus\b/.test(t.description)) {
    t.description = t.description.replace(/\bAsus\b/g, "ASUS");
    n++;
  }
}
console.log("descriptions fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
