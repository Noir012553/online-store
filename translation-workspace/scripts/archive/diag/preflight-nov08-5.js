// Verify the 5 fixed slots pass the validator.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov08.json"),
    "utf8",
  ),
);
const tails = ["c69b", "c6a5", "c7e3", "c7ed"];
const slice = importData.records.filter((r) =>
  tails.some((t) => r.productId.endsWith(t)),
);
let leaks = 0,
  ok = 0;
for (const rec of slice) {
  const lang = rec.targetLang;
  for (const [f, type] of [
    ["name", "product_name"],
    ["description", "product_description"],
    ["technicalDescription", "product_technical_description"],
  ]) {
    const src = String(rec.source[f] || "");
    const trs = String(rec.translations[f] || "");
    const wl = validator.checkSourceLanguageLeak(src, trs, lang, type);
    if (wl) {
      leaks++;
      console.log(
        `LEAK ${rec.productId.slice(-4)}/${lang} ${f}: "${wl.phrase}"`,
      );
    } else ok++;
  }
}
console.log(`total ok=${ok}, leaks=${leaks}`);
