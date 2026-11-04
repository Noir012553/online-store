// Re-run full validation on the STORED DB pair + reproduce endpoint's exact validateField behavior
const path = require("path");
try {
  require("dotenv").config({
    path: path.resolve(__dirname, "../../.env"),
    quiet: true,
  });
} catch (e) {
  if (e.code !== "MODULE_NOT_FOUND") throw e;
}
const mongoose = require("mongoose");
const validator = require("../utils/translationValidator");
const T = require("../models/ProductCatalogTranslationCache");
const P = require("../models/Product");
const fs = require("fs");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const p = await P.findById("6ad0cb680069aece85a8c613")
    .select("description")
    .lean();
  const t = await T.findOne({
    entityId: "6ad0cb680069aece85a8c613",
    targetLang: "fr",
  })
    .select("description")
    .lean();

  // 1. full validateTranslation on stored pair
  const full = await validator.validateTranslation(
    p.description,
    t.description,
    "fr",
    "product_description",
  );
  console.log("FULL:", JSON.stringify(full));

  // 2. single checkSourceLanguageLeak — which phrase?
  const leak = validator.checkSourceLanguageLeak(
    p.description,
    t.description,
    "fr",
    "product_description",
  );
  console.log("LEAK:", JSON.stringify(leak));

  // 3. reproduce endpoint: validateField(sourceProduct.description, translations.description)
  // where translations.description comes from the IMPORTED batch JSON (pre-merge, raw)
  const batch = JSON.parse(
    fs.readFileSync(
      "e:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-aspirego14-fr.json",
      "utf8",
    ),
  );
  const rawDesc = batch.records[0].translations.description;
  const rawFull = await validator.validateTranslation(
    p.description,
    rawDesc,
    "fr",
    "product_description",
  );
  console.log("RAW-BATCH-FULL:", JSON.stringify(rawFull));
  const rawLeak = validator.checkSourceLanguageLeak(
    p.description,
    rawDesc,
    "fr",
    "product_description",
  );
  console.log("RAW-BATCH-LEAK:", JSON.stringify(rawLeak));

  // 4. is stored description identical to raw batch?
  console.log("STORED==RAW:", t.description === rawDesc);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exitCode = 1;
});
