// One-off: discover missing languages per product from coverage
const fs = require("fs");
const path = require("path");
const j = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "data",
      "archive",
      "import",
      "assistant-batch-import-next.json",
    ),
    "utf8",
  ),
);
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
const m = {};
for (const r of j.records) {
  const s = String(r.productId).slice(-4);
  m[s] = m[s] || new Set();
  m[s].add(r.targetLang);
}
for (const s of SFX) {
  const missing = LANGS.filter((l) => !(m[s] || new Set()).has(l));
  console.log(
    s,
    "filled:",
    (m[s] || new Set()).size,
    "missing:",
    missing.length ? missing.join(",") : "none",
  );
}
