// Verify: wrong_language fix for technicalDescription JSON-inline
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

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const p = await P.findById("6ad0cb680069aece85a8c613").lean();
  const t = await T.findOne({
    entityId: "6ad0cb680069aece85a8c613",
    targetLang: "fr",
  })
    .select("technicalDescription")
    .lean();
  console.log(
    "prose part:",
    JSON.stringify(
      validator.stripTechnicalDescriptionJson(t.technicalDescription),
    ),
  );
  const full = await validator.validateTranslation(
    p.technicalDescription,
    t.technicalDescription,
    "fr",
    "product_technical_description",
  );
  console.log("TECH-FULL:", JSON.stringify(full));
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exitCode = 1;
});
