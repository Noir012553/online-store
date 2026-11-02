// Diagnose 5 c6a4 pending records: read validationErrors from DB.
const fs = require("fs");
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const IMPORT = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov07.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  for (const lang of ["en", "pt", "fr", "de", "es"]) {
    const rec = importData.records.find(
      (r) => r.productId.endsWith("c6a4") && r.targetLang === lang,
    );
    const doc = await cache.findOne(
      { entityId: rec.productId, targetLang: lang },
      { projection: { validationErrors: 1, qualityScore: 1 } },
    );
    console.log(
      "=== " +
        lang +
        " score=" +
        doc.qualityScore +
        " errors=" +
        JSON.stringify(doc.validationErrors),
    );
    console.log("  name: " + JSON.stringify(rec.translations.name));
    console.log(
      "  desc[0:300]: " +
        JSON.stringify(rec.translations.description.slice(0, 300)),
    );
    console.log(
      "  tech: " + JSON.stringify(rec.translations.technicalDescription),
    );
    console.log("  specs: " + JSON.stringify(rec.translations.specs));
    console.log("  src name: " + JSON.stringify(rec.source.name));
    console.log(
      "  src tech: " + JSON.stringify(rec.source.technicalDescription),
    );
    console.log("  src specs: " + JSON.stringify(rec.source.specs));
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
