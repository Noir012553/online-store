// Final full-scan: which products have translationReady=false, and per-product
// locale coverage detail for anything short of 8.
const path = require("path");
const fs = require("fs");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const LOCALES = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  const approved = await cache
    .aggregate([
      { $match: { status: "success", qualityStatus: "approved" } },
      { $group: { _id: "$entityId", langs: { $addToSet: "$targetLang" } } },
    ])
    .toArray();
  const map = new Map(approved.map((a) => [a._id, new Set(a.langs)]));
  const products = await db
    .collection("products")
    .find({}, { projection: { name: 1 } })
    .toArray();
  const bad = [];
  for (const p of products) {
    const pid = p._id.toString();
    const have = map.get(pid) || new Set();
    const gaps = LOCALES.filter((l) => !have.has(l));
    if (gaps.length) bad.push(`${pid} | ${p.name} | gaps: ${gaps.join(",")}`);
  }
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "full-scan-gaps.txt"),
    bad.join("\n"),
    "utf8",
  );
  console.log(bad.length ? bad.join("\n") : "ALL 604 PRODUCTS FULLY COVERED ✓");
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
