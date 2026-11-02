// Check DB state for c891 slots to see real validationErrors.
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const d = JSON.parse(
  require("fs").readFileSync(
    path.join(
      __dirname,
      "..",
      "data",
      "import",
      "assistant-batch-import-nov09.json",
    ),
    "utf8",
  ),
);

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const cache = mongoose.connection.db.collection(
    "product_catalog_translation_cache",
  );
  for (const r of d.records.filter((r) => r.productId.endsWith("c891"))) {
    const doc = await cache.findOne(
      { entityId: r.productId, targetLang: r.targetLang },
      {
        projection: { qualityStatus: 1, qualityScore: 1, validationErrors: 1 },
      },
    );
    console.log(
      r.targetLang,
      doc?.qualityStatus,
      "score=" + doc?.qualityScore,
      JSON.stringify(doc?.validationErrors),
    );
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
