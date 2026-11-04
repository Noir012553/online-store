// TEMP read-only: get full techDesc source + current fr/pt cache for Aspire Go 14 sample
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
const P = require("../models/Product");
const T = require("../models/ProductCatalogTranslationCache");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const p = await P.findById("6ad0cb680069aece85a8c613")
    .select("name description technicalDescription brand specs")
    .lean();
  console.log("TECHLEN:", p.technicalDescription?.length);
  console.log(JSON.stringify(p.technicalDescription));
  const caches = await T.find({
    entityId: "6ad0cb680069aece85a8c613",
    targetLang: { $in: ["fr", "pt"] },
  })
    .select("targetLang technicalDescription description")
    .lean();
  caches.forEach((c) => {
    console.log(
      "---",
      c.targetLang,
      "techLen",
      c.technicalDescription?.length,
      "descLen",
      c.description?.length,
    );
    console.log(JSON.stringify((c.technicalDescription || "").slice(0, 300)));
  });
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exitCode = 1;
});
