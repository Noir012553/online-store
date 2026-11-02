// Diagnose wrong_language across the whole batch using the REAL validator.
const path = require("path");
const validator = require(path.join(__dirname, "..", "..", "online-store-backend", "src", "utils", "translationValidator.js"));
const batch = require(path.join(__dirname, "..", "data", "import", "assistant-batch-import-next.json"));

(async () => {
  const results = {};
  const examples = {};
  for (const rec of batch.records) {
    if (!rec.translations || !rec.translations.name) continue;
    for (const [field, text] of [["description", rec.translations.description], ["name", rec.translations.name], ["technicalDescription", rec.translations.technicalDescription]]) {
      const det = await validator.checkWrongLanguage(text, rec.targetLang);
      if (det) {
        const k = `${rec.targetLang} ${field} -> ${det.detected}`;
        results[k] = (results[k] || 0) + 1;
        if (!examples[k]) examples[k] = `${rec.productId.slice(-4)}: ${text.slice(0, 80)}`;
      }
    }
  }
  console.log(JSON.stringify(results, null, 2));
  console.log("\nexamples:");
  for (const [k, v] of Object.entries(examples)) console.log(`- ${k}: ${v}`);
  require("fs").writeFileSync(
    path.join(__dirname, "..", "logs", "wrong-language-last.txt"),
    JSON.stringify(results, null, 2) + "\n\n" + Object.entries(examples).map(([k, v]) => `${k}: ${v}`).join("\n"),
    "utf8",
  );
})();
