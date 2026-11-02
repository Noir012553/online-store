// Diagnose why the 4 c5fb records are still not_eligible: fetch each draft's
// stored validationErrors from the DB (read-only).
const path = require("path");
const BACKEND = path.join(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  const targets = [
    ["6ad0ca970069aece85a8c5fb", "pt"],
    ["6ad0ca970069aece85a8c5fb", "fr"],
    ["6ad0ca970069aece85a8c5fb", "it"],
    ["6ad0ca970069aece85a8c5fb", "es"],
  ];
  for (const [pid, lang] of targets) {
    const doc = await cache.findOne(
      { entityId: pid, targetLang: lang },
      {
        projection: {
          provider: 1,
          providerSource: 1,
          status: 1,
          qualityStatus: 1,
          validationErrors: 1,
          qualityScore: 1,
          updatedAt: 1,
        },
      },
    );
    console.log(pid.slice(-4) + "/" + lang, JSON.stringify(doc, null, 1));
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
