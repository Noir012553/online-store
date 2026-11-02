// Round 7: list products that are NOT translationReady, with their per-locale
// cache status, so the export covers exactly the missing slots.
const path = require("path");
const fs = require("fs");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const OUT = path.join(__dirname, "..", "logs", "r7-notready.txt");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const products = await db
    .collection("products")
    .find({ translationReady: { $ne: true } })
    .project({ name: 1, brand: 1, sku: 1 })
    .toArray();
  const cache = db.collection("product_catalog_translation_cache");
  const lines = [];
  lines.push(`not ready: ${products.length}`);
  for (const p of products) {
    const docs = await cache
      .find({ entityId: String(p._id) })
      .project({ targetLang: 1, qualityStatus: 1, status: 1 })
      .toArray();
    const m = {};
    for (const d of docs) m[d.targetLang] = `${d.qualityStatus}/${d.status}`;
    lines.push(
      `${p._id} ${p.brand || ""} ${p.sku || p.name || ""} :: ${JSON.stringify(m)}`,
    );
  }
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  console.log(lines.slice(0, 10).join("\n"));
  console.log("... full list in", OUT);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
