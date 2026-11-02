// Audit: gap distribution across not-ready products (what's left, per locale, per brand).
const path = require("path");
const fs = require("fs");
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
  const products = db.collection("products");
  const cache = db.collection("product_catalog_translation_cache");
  const LOCALES = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];
  const partial = await cache
    .aggregate([
      { $match: { status: "success", qualityStatus: "approved" } },
      { $group: { _id: "$entityId", langs: { $addToSet: "$targetLang" } } },
      { $project: { n: { $size: "$langs" } } },
    ])
    .toArray();
  const byId = new Map(partial.map((p) => [p._id, p]));
  const notReady = await products
    .find(
      { translationReady: { $ne: true } },
      { projection: { _id: 1, brand: 1, name: 1 } },
    )
    .sort({ _id: 1 })
    .toArray();
  const missingByLang = {};
  let missingTotal = 0;
  const productsWithAnyApproved = notReady.filter((p) =>
    byId.has(String(p._id)),
  );
  const productsNone = notReady.filter((p) => !byId.has(String(p._id)));
  for (const p of productsWithAnyApproved) {
    const have = new Set(byId.get(String(p._id)).langs);
    for (const l of LOCALES) {
      if (!have.has(l)) {
        missingByLang[l] = (missingByLang[l] || 0) + 1;
        missingTotal++;
      }
    }
  }
  const dist = {};
  for (const p of productsWithAnyApproved) {
    const n = byId.get(String(p._id)).n;
    dist[n] = (dist[n] || 0) + 1;
  }
  const brands = {};
  for (const p of productsWithAnyApproved) {
    const b = p.brand || "?";
    brands[b] = (brands[b] || 0) + 1;
  }
  const brandsNone = {};
  for (const p of productsNone) {
    const b = p.brand || "?";
    brandsNone[b] = (brandsNone[b] || 0) + 1;
  }
  const namesNone = productsNone
    .slice(0, 8)
    .map((p) => (p.name || "").slice(0, 55));
  console.log(
    JSON.stringify(
      {
        notReady: notReady.length,
        withAnyApproved: productsWithAnyApproved.length,
        noneApproved: productsNone.length,
        missingTotal, 
        missingByLang,
        localesPerProductDist: dist,
        brandsPartial: brands,
        brandsNone: brandsNone,
        sampleNoneNames: namesNone,
      },
      null,
      1,
    ),
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
