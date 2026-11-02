// Diagnose the 9 not_eligible drafts: read stored validationErrors from DB.
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));

const TARGETS = [
  ["6ad0cc010069aece85a8c638", "en"],
  ["6ad0cc010069aece85a8c639", "en"],
  ["6ad0cc440069aece85a8c654", "it"],
  ["6ad0cc440069aece85a8c658", "it"],
  ["6ad0ce6e0069aece85a8c6be", "it"],
  ["6ad0ce6e0069aece85a8c6c0", "en"],
  ["6ad0ce6e0069aece85a8c6c1", "nl"],
  ["6ad0ce6e0069aece85a8c6c2", "it"],
  ["6ad0cff40069aece85a8c6f8", "it"],
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  for (const [pid, lang] of TARGETS) {
    const doc = await cache.findOne(
      { entityId: pid, targetLang: lang },
      { projection: { validationErrors: 1, qualityScore: 1 } },
    );
    console.log(
      pid.slice(-4) + "/" + lang,
      JSON.stringify(doc && doc.validationErrors),
      "score:",
      doc && doc.qualityScore,
    );
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
