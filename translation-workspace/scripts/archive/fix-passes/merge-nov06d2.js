// Wire the nov06d2 hand file into build-import-nov06d.js priority list.
// Simplest fix: merge translations-nov06d2-hand.json into translations-nov06d-hand.json
// (nov06d2 takes priority where it exists since it's loaded later? No —
// build reads HAND first. Merge here: write merged file into nov06d-hand.)
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const save = (p, d) =>
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n", "utf8");

const handPath = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const d2Path = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d2-hand.json",
);
const base = load(handPath);
const d2 = load(d2Path);

let added = 0;
for (const [pid, langs] of Object.entries(d2)) {
  base[pid] = base[pid] || {};
  for (const [lang, t] of Object.entries(langs)) {
    if (!t.name || !t.description || t.description.startsWith("TBD-")) continue;
    base[pid][lang] = t;
    added++;
  }
}
save(handPath, base);
console.log("merged nov06d2 into nov06d-hand; added", added);
