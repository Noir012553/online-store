// Diagnose the "việt nam" leak precisely using the validator's bigram logic.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov09.json"),
    "utf8",
  ),
);
const r = d.records.find(
  (x) => x.productId.endsWith("c63a") && x.targetLang === "en",
);
const src = r.source.description;
const trs = r.translations.description;
const wl = validator.checkSourceLanguageLeak(
  src,
  trs,
  "en",
  "product_description",
);
console.log("leak:", JSON.stringify(wl));
if (wl) {
  const hay = trs.toLowerCase();
  const needle = String(wl.phrase).toLowerCase();
  const idx = hay.indexOf(needle);
  if (idx >= 0)
    console.log(
      "TR ctx:",
      JSON.stringify(
        trs.slice(Math.max(0, idx - 100), idx + needle.length + 100),
      ),
    );
  const i2 = hay.indexOf("viet nam");
  if (i2 >= 0)
    console.log(
      "TR 'viet nam' at:",
      i2,
      JSON.stringify(trs.slice(Math.max(0, i2 - 80), i2 + 120)),
    );
  const i3 = hay.indexOf("vietnam");
  if (i3 >= 0)
    console.log(
      "TR 'vietnam' at:",
      i3,
      JSON.stringify(trs.slice(Math.max(0, i3 - 80), i3 + 120)),
    );
}
// scan ALL fields
for (const [f, type] of [
  ["name", "product_name"],
  ["description", "product_description"],
  ["technicalDescription", "product_technical_description"],
]) {
  const w = validator.checkSourceLanguageLeak(
    r.source[f] || "",
    r.translations[f] || "",
    "en",
    type,
  );
  if (w) console.log("FIELD", f, "leak:", JSON.stringify(w.phrase));
}
for (const k of Object.keys(r.translations.specs || {})) {
  const w = validator.checkSourceLanguageLeak(
    r.source.specs[k] || "",
    r.translations.specs[k] || "",
    "en",
    "product_spec",
  );
  if (w) console.log("SPEC", k, "leak:", JSON.stringify(w.phrase));
}
