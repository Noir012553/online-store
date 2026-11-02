// Export the next 50 products (fewest gaps first) with their missing locales.
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
      { projection: { _id: 1, name: 1 } },
    )
    .sort({ _id: 1 })
    .toArray();
  const withGaps = notReady
    .map((p) => {
      const pid = String(p._id);
      const have = new Set(byId.has(pid) ? byId.get(pid).langs : []);
      const gaps = LOCALES.filter((l) => !have.has(l));
      return { pid, gaps, name: (p.name || "").slice(0, 70) };
    })
    .filter((g) => g.gaps.length)
    .sort((a, b) => a.gaps.length - b.gaps.length)
    .slice(0, 50);
  let total = 0;
  for (const g of withGaps) {
    total += g.gaps.length;
    console.log(g.pid, g.gaps.join(","), "|", g.name);
  }
  console.log("TOTAL SLOTS:", total);
  fs.writeFileSync(
    path.join(__dirname, "..", "data", "export", "next50-products.json"),
    JSON.stringify(
      withGaps.map((g) => ({ pid: g.pid, gaps: g.gaps })),
      null,
      1,
    ),
    "utf8",
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
