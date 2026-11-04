// Diagnose: full validation on the STORED pair (source vs imported FR description)
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
const v = require("../utils/translationValidator");
const T = require("../models/ProductCatalogTranslationCache");
const P = require("../models/Product");

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
  const full = await v.validateTranslation(
    p.description,
    t.description,
    "fr",
    "product_description",
  );
  console.log("FULL:", JSON.stringify(full, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exitCode = 1;
});
