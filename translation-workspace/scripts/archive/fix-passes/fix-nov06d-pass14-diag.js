// Fix pass 14 — chip fixes that a generic "Intel/AMD/NVIDIA platform" sentence
// won't satisfy because the SOURCE mentions them in a specific way.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const DATA = path.join(WS, "data");
const BACKEND = path.join(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const importData = JSON.parse(
  fs.readFileSync(
    path.join(DATA, "import", "assistant-batch-import-nov06d.json"),
    "utf8",
  ),
);

// Inspect each failing record's source description for context around the chip word.
for (const [tail, lang, chip] of [
  ["c8e1", "pt", "MacBook"],
  ["c623", "it", "Intel"],
  ["c697", "pt", "NVIDIA"],
  ["c69e", "pt", "NVIDIA"],
  ["c69f", "pt", "NVIDIA"],
  ["c6a3", "fr", "NVIDIA"],
]) {
  const rec = importData.records.find(
    (r) => r.productId.endsWith(tail) && r.targetLang === lang,
  );
  const desc = rec.source.description;
  const i = desc.indexOf(chip);
  console.log(
    "---",
    tail,
    lang,
    chip,
    "ctx:",
    JSON.stringify(desc.slice(Math.max(0, i - 120), i + 120)),
  );
}
