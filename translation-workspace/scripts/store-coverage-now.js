// Tổng quan toàn cửa hàng: tổng số sản phẩm, số sản phẩm translationReady=true,
// số sản phẩm đủ 8 locale approved.
const path = require("path");
const fs = require("fs");
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
  const products = db.collection("products");
  const cache = db.collection("product_catalog_translation_cache");

  const total = await products.countDocuments({});
  const ready = await products.countDocuments({ translationReady: true });
  // approved coverage per product
  const approved = await cache
    .aggregate([
      { $match: { status: "success", qualityStatus: "approved" } },
      { $group: { _id: "$entityId", langs: { $addToSet: "$targetLang" } } },
      { $project: { count: { $size: "$langs" } } },
    ])
    .toArray();
  const full = approved.filter((a) => a.count >= 8).length;
  const partial = approved.filter((a) => a.count > 0 && a.count < 8).length;
  const none = total - approved.length;

  const langs = await cache
    .aggregate([
      { $match: { status: "success", qualityStatus: "approved" } },
      { $group: { _id: "$targetLang", n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  console.log(
    JSON.stringify(
      {
        totalProducts: total,
        translationReadyTrue: ready,
        fullEightLocaleApproved: full,
        partiallyApproved: partial,
        notStarted: none,
        approvedDocsByLang: langs.map((l) => `${l._id}:${l.n}`).join(", "),
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "store-coverage-now.txt"),
    JSON.stringify({ total, ready, full, partial, none, langs }, null, 2),
    "utf8",
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
