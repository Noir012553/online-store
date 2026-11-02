// Export the pid+gap list for all products that are NOT fully approved
// (used to fill missing slots). Writes data/export/next50-products.json
// with { pid, gaps: [langs...] } entries for every product with <8
// approved slots.
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
  const cache = mongoose.connection.db.collection(
    "product_catalog_translation_cache",
  );
  const db = mongoose.connection.db;
  const covered = new Set((await cache.distinct("entityId")).map(String));
  const approved = await cache
    .aggregate([
      { $match: { status: "success", qualityStatus: "approved" } },
      { $group: { _id: "$entityId", langs: { $addToSet: "$targetLang" } } },
    ])
    .toArray();
  const byPid = new Map(approved.map((a) => [a._id, new Set(a.langs)]));

  const slots = [];
  // include products with NO docs at all (8 gaps each)
  const allProducts = await db
    .collection("products")
    .find({}, { projection: { _id: 1 } })
    .toArray();
  for (const p of allProducts) {
    const pid = p._id.toString();
    const have = byPid.get(pid) || new Set();
    if (!covered.has(pid)) {
      slots.push({ pid, gaps: [...LOCALES] });
      continue;
    }
    const gaps = LOCALES.filter((l) => !have.has(l));
    if (gaps.length) slots.push({ pid, gaps });
  }
  fs.writeFileSync(
    path.join(__dirname, "..", "data", "export", "next50-products.json"),
    JSON.stringify(slots, null, 2),
    "utf8",
  );
  console.log("products with gaps:", slots.length);
  console.log(
    "total slots:",
    slots.reduce((n, s) => n + s.gaps.length, 0),
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
