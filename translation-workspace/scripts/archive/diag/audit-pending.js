// Check pending assistant drafts in cache (provider=assistant, qualityStatus=pending).
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
  const pend = await cache
    .aggregate([
      {
        $match: {
          provider: "assistant",
          providerSource: "assistant_batch",
          status: "success",
          qualityStatus: "pending",
        },
      },
      { $group: { _id: "$targetLang", n: { $sum: 1 } } },
    ])
    .toArray();
  console.log("pending drafts by lang:", JSON.stringify(pend));
  const total = await cache.countDocuments({
    provider: "assistant",
    providerSource: "assistant_batch",
    status: "success",
    qualityStatus: "pending",
  });
  console.log("total pending drafts:", total);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
