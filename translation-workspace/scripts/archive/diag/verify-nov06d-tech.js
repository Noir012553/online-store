// Re-verify tech leaks after pass6 with correct backend path.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const b = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06d.json"),
    "utf8",
  ),
);
let totalProblems = 0;
for (const rec of b.records) {
  const wl = validator.checkSourceLanguageLeak(
    rec.source.technicalDescription,
    rec.translations.technicalDescription || "",
    rec.targetLang,
    "product_technical_description",
  );
  if (wl) {
    console.log(
      rec.productId.slice(-4) + "/" + rec.targetLang,
      "mixed:",
      JSON.stringify(wl.phrase),
    );
    totalProblems++;
  }
}
console.log("remaining tech leaks:", totalProblems);
