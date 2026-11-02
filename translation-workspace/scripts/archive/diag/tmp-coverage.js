// One-off: coverage matrix of data/translations/translations-next3-{lang}.json
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const LANGS = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];
const SFX = [
  "c5eb",
  "c5f3",
  "c5f4",
  "c5f5",
  "c5f6",
  "c5f7",
  "c5f8",
  "c5f9",
  "c5fa",
  "c5fb",
];
const files = {};
for (const l of LANGS) {
  const f = path.join(
    WS,
    "data",
    "translations",
    `translations-next3-${l}.json`,
  );
  files[l] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
}
let total = 0;
for (const sfx of SFX) {
  const row = LANGS.map((l) => {
    const pid = Object.keys(files[l]).find((k) => k.endsWith(sfx));
    const t = pid && files[l][pid][l];
    const ok = t && t.name && t.description;
    if (ok) total++;
    return ok ? l.toUpperCase()[0] : "-";
  }).join("");
  console.log(sfx, row);
}
console.log("filled:", total, "/ expected:", SFX.length * 8);
