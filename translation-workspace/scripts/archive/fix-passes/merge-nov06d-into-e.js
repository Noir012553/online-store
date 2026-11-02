// Merge leftover translated slots from earlier batch hand files into
// translations-nov06e-hand.json so the nov06e build can fill 95/95.
// Sources: translations-nov06d-hand.json (103 valid entries from batch nov06d).
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const OUT_PATH = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const dPath = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);

const OUT = load(OUT_PATH);
const D = load(dPath);
// Export json tells us the exact slots needed
const EXP_PATH = path.join(WS, "data", "export", "assistant-batch-next.json");
const exp = JSON.parse(fs.readFileSync(EXP_PATH, "utf8"));

let added = 0;
for (const rec of exp.records) {
  const pid = rec.productId,
    lang = rec.targetLang;
  if (
    OUT[pid] &&
    OUT[pid][lang] &&
    OUT[pid][lang].name &&
    OUT[pid][lang].description
  )
    continue;
  const dEntry = D[pid] && D[pid][lang];
  if (dEntry && dEntry.name && dEntry.description) {
    OUT[pid] = OUT[pid] || {};
    OUT[pid][lang] = dEntry;
    added++;
  }
}
fs.writeFileSync(OUT_PATH, JSON.stringify(OUT, null, 2) + "\n", "utf8");
console.log("added from nov06d-hand:", added);
