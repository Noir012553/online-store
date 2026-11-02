// Fix pass 17 — find where "iPad" appears in the source of c8a2 and mirror it in the it translation.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const SRC = path.join(WS, "data", "export", "assistant-batch-next.json");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const s = src.records.find((x) => x.productId === "6ad0d5ed0069aece85a8c8a2");
const hay = JSON.stringify(s.source || s, null, 1);
const idx = hay.indexOf("iPad");
console.log("iPad idx:", idx, hay.slice(Math.max(0, idx - 200), idx + 120));
const r = d.records.find(
  (x) => x.productId === "6ad0d5ed0069aece85a8c8a2" && x.targetLang === "it",
);
const hidx = r.translations.description.indexOf("iPad");
console.log("translation has iPad idx:", hidx);
if (idx >= 0 && hidx < 0) {
  // mirror: append the same sentence pattern used in source
  const frag = hay.slice(idx - 100, idx + 150);
  console.log("context frag:", frag);
}
