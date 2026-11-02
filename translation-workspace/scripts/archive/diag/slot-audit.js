// Slot audit: for each not-ready product, count missing locales.
const fs = require("fs");
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
  const products = db.collection("products");
  const cache = db.collection("product_catalog_translation_cache");
  const LOCALES = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];
// Optional: cap the number of products exported this run (fewest-gaps first).
const LIMIT_RAW = process.env.MAX_PRODUCTS_AUDIT || "";
  const partial = await cache
    .aggregate([
      { $match: { status: "success", qualityStatus: "approved" } },
      { $group: { _id: "$entityId", langs: { $addToSet: "$targetLang" } } },
    ])
    .toArray();
  const byId = new Map(partial.map((p) => [p._id, p]));
  const notReady = await products
    .find(
      { translationReady: { $ne: true } },
      { projection: { _id: 1, brand: 1 } },
    )
    .sort({ _id: 1 })
    .toArray();
  let missingTotal = 0;
  const recs = [];
  const LIMIT = process.env.MAX_PRODUCTS_AUDIT
    ? Number(process.env.MAX_PRODUCTS_AUDIT)
    : Infinity;
  let prodSeen = 0;
  // Sort: products with fewest gaps first (cheap wins).
  const withGaps = notReady
    .map((p) => {
      const pid = String(p._id);
      const have = new Set(byId.has(pid) ? byId.get(pid).langs : []);
      const gaps = LOCALES.filter((l) => !have.has(l));
      return { pid, gaps, brand: p.brand };
    })
    .filter((g) => g.gaps.length)
    .sort((a, b) => a.gaps.length - b.gaps.length);
  for (const g of withGaps) {
    if (prodSeen >= LIMIT) break;
    prodSeen++;
    for (const l of g.gaps) {
      recs.push(g.pid.slice(-4) + ":" + l);
      missingTotal++;
    }
  }
  console.log("total missing slots:", missingTotal);
  console.log("first 60:", recs.slice(0, 60).join(" "));
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "slot-audit.json"),
    JSON.stringify({ missingTotal, recs }, null, 1),
    "utf8",
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
