// Build batch: fix Arc token in fr technicalDescription of Aspire Go 14 + read current PT desc gap
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
const fs = require("fs");
const P = require("../models/Product");
const T = require("../models/ProductCatalogTranslationCache");
const {
  getProductTranslationSourceHash,
} = require("../utils/productTranslationFingerprint");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const p = await P.findById("6ad0cb680069aece85a8c613").lean();
  const frCache = await T.findOne({
    entityId: "6ad0cb680069aece85a8c613",
    targetLang: "fr",
  })
    .select("technicalDescription")
    .lean();
  const fixedTech = frCache.technicalDescription.replace(
    /"Intel Graphics"/g,
    '"Intel Arc Graphics"',
  );
  console.log("ARC-FIX-CHANGED:", fixedTech !== frCache.technicalDescription);

  const payload = {
    workflow: "assistant_batch",
    records: [
      {
        productId: "6ad0cb680069aece85a8c613",
        targetLang: "fr",
        sourceHash: getProductTranslationSourceHash(p),
        translations: { technicalDescription: fixedTech },
      },
    ],
  };
  const outPath =
    "e:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-aspirego14-fr-techfix.json";
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log("wrote", outPath);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exitCode = 1;
});
