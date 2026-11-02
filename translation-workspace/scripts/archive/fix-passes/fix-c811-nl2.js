// Fix c811/nl — my earlier COLOR_TR didn't catch "Đen contour" for nl because
// it lives only in the COLOR_TR list I added (not in VALUE_TR for values).
// Translate "(Đen contour/" → "(Zwart contour/" and replace everywhere.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const rec = d.records.find(
  (r) => r.productId.endsWith("c811") && r.targetLang === "nl",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const nlRecord = hand[rec.productId].nl;
const fix = (text) =>
  text
    .replace(/Đen contour/g, "Zwart contour")
    .replace(/Đen contour/gi, "Zwart contour");
rec.translations.name = fix(rec.translations.name);
rec.translations.description = fix(rec.translations.description);
rec.translations.technicalDescription = fix(
  rec.translations.technicalDescription,
);
rec.translations.imageAlts = (rec.translations.imageAlts || []).map((a) =>
  fix(a),
);
nlRecord.name = fix(nlRecord.name);
nlRecord.description = fix(nlRecord.description);
nlRecord.technicalDescription = fix(nlRecord.technicalDescription);
nlRecord.imageAlts = (nlRecord.imageAlts || []).map((a) => fix(a));
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c811/nl fixed");
