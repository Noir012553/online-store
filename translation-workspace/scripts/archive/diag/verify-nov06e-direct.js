// Re-run the leak sweep in slices (validator is ~3s/record).
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06e.json"),
    "utf8",
  ),
);
const from = Number(process.argv[2] || 0);
const to = Number(process.argv[3] || importData.records.length);
const slice = importData.records.slice(from, to);
const out = [];
let leaks = 0;
for (const rec of slice) {
  const lang = rec.targetLang;
  const wl = validator.checkSourceLanguageLeak(
    rec.source.description,
    rec.translations.description || "",
    lang,
    "product_description",
  );
  if (wl) {
    leaks++;
    out.push(
      `LEAK ${rec.productId.slice(-4)}/${lang} ${JSON.stringify(wl.phrase)}`,
    );
  }
}
out.push(`slice [${from},${to}): leaks=${leaks}`);
fs.appendFileSync(
  path.join(WS, "logs", "verify-nov06e.txt"),
  out.join("\n") + "\n",
  "utf8",
);
console.log(out.join("\n"));
