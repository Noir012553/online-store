// Round 7: build next50-products.json from actual not-ready cache state.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
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

  const notReady = await products
    .find(
      { translationReady: { $ne: true } },
      { projection: { _id: 1, name: 1 } },
    )
    .sort({ _id: 1 })
    .toArray();
  const entities = notReady.map((p) => String(p._id));
  const docs = await cache
    .find({ entityId: { $in: entities } })
    .project({ entityId: 1, targetLang: 1, qualityStatus: 1 })
    .toArray();
  const byId = {};
  for (const d of docs) {
    (byId[d.entityId] = byId[d.entityId] || []).push(d);
  }
  const out = [];
  for (const p of notReady) {
    const pid = String(p._id);
    const docs2 = byId[pid] || [];
    const gaps = LOCALES.filter((l) => {
      const d = docs2.find((x) => x.targetLang === l);
      if (!d) return true;
      return d.qualityStatus !== "approved";
    });
    if (gaps.length) out.push({ pid, gaps, name: (p.name || "").slice(0, 70) });
  }
  let total = 0;
  for (const g of out) total += g.gaps.length;
  console.log("products with gaps:", out.length, "total slots:", total);
  const byLang = {};
  for (const g of out) for (const l of g.gaps) byLang[l] = (byLang[l] || 0) + 1;
  console.log("by lang:", JSON.stringify(byLang));
  fs.writeFileSync(
    path.join(WS, "data", "export", "next50-products.json"),
    JSON.stringify(
      out.map((g) => ({ pid: g.pid, gaps: g.gaps })),
      null,
      1,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(WS, "logs", "r7-next50-names.txt"),
    out.map((g) => g.pid + " " + g.name).join("\n") + "\n",
    "utf8",
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
