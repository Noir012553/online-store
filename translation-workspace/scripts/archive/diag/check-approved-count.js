// Overview: how many products are translationReady + per-locale quality counts.
const path = require("path");
const cfg = require("./config");
const mongoose = require(path.join(cfg.BACKEND_MODULES, "mongoose"));
(async () => {
  await cfg.connectMongoose();
  const db = mongoose.connection.db;
  const products = db.collection("products");
  const cache = db.collection(cfg.CACHE_COLLECTION);
  const total = await products.countDocuments({});
  const ready = await products.countDocuments({ translationReady: true });
  const agg = await cache
    .aggregate([
      {
        $group: {
          _id: "$targetLang",
          approved: {
            $sum: { $cond: [{ $eq: ["$qualityStatus", "approved"] }, 1, 0] },
          },
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ["$qualityStatus", "pending"] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$qualityStatus", "failed"] }, 1, 0] },
          },
          review: {
            $sum: { $cond: [{ $eq: ["$qualityStatus", "review"] }, 1, 0] },
          },
        },
      },
    ])
    .sort({ _id: 1 })
    .toArray();
  console.log(
    JSON.stringify(
      {
        totalProducts: total,
        translationReady: ready,
        notReady: total - ready,
        perLang: agg,
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
