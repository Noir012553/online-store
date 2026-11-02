// Diag c728 tech: print src vs tr tech + name token diff (validator regex).
const path = require("path");
const fs = require("fs");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
const validator = require(path.join(BACKEND, "src", "utils", "translationValidator.js"));
const WS = path.join(__dirname, "..");
const d = JSON.parse(
  fs.readFileSync(path.join(WS, "data", "import", "assistant-batch-import-nov10.json"), "utf8"),
);
const r = d.records.find((x) => x.productId.endsWith("c728") && x.targetLang === "en");
console.log("SRC tech:", JSON.stringify(r.source.technicalDescription));
console.log("TR  tech:", JSON.stringify(r.translations.technicalDescription));
console.log("name==src:", r.translations.name === r.source.name);
console.log(
  "name tokens via checkTechnicalTokens:",
  JSON.stringify(validator.checkTechnicalTokens(r.source.name, r.translations.name)),
);
