// Check the 5 products with 0 cache docs: do they exist and have content?
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
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
  const covered = await cache.distinct("entityId");
  const coveredSet = new Set(covered);
  const products = await db
    .collection("products")
    .find({}, { projection: { name: 1, translationReady: 1 } })
    .toArray();
  const missing = products.filter((p) => !coveredSet.has(p._id.toString()));
  console.log("products without any cache doc:", missing.length);
  for (const p of missing)
    console.log(
      " ",
      p._id.toString(),
      "|",
      p.name,
      "| translationReady:",
      p.translationReady,
    );
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
