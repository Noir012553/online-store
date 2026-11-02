// Diag c891 not_eligible: run the REAL validator exactly as the approve route
// does — validate(translation, source, targetLang) if such signature exists.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const V = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const validator = V.default || V.translationValidator || V;
console.log("keys:", Object.keys(V));
console.log(
  "prototype:",
  Object.getOwnPropertyNames(Object.getPrototypeOf(validator)),
);
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov09.json"),
    "utf8",
  ),
);
const rec = d.records.find(
  (r) => r.productId.endsWith("c891") && r.targetLang === "sv",
);
const inst = new validator();
const combined = { ...rec.translations, brand: rec.translations.brand };
for (const [fn, args] of [
  ["checkBrandConsistency", [rec.source.brand, rec.translations.brand]],
  ["checkBrandMentions", [rec.source, rec.translations]],
]) {
  try {
    console.log(fn, "→", JSON.stringify(inst[fn](...args)));
  } catch (e) {
    console.log(fn, "ERR", e.message.split("\n")[0]);
  }
}
