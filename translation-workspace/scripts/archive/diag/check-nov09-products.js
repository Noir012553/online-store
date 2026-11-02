// Check the 36 nov09 products: per-product approved locale count + gaps.
const path = require("path");
const fs = require("fs");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const IMPORT = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const pids = [...new Set(d.records.map((r) => r.productId))];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  const products = db.collection("products");
  const out = [];
  let full = 0;
  for (const pid of pids) {
    const docs = await cache
      .find(
        { entityId: pid, status: "success", qualityStatus: "approved" },
        { projection: { targetLang: 1 } },
      )
      .toArray();
    const langs = docs.map((x) => x.targetLang).sort();
    const missing = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"].filter(
      (l) => !langs.includes(l),
    );
    const p = await products.findOne(
      { _id: mongoose.mongo.ObjectId.createFromHexString(pid) },
      { projection: { name: 1, translationReady: 1 } },
    );
    if (missing.length === 0) full++;
    out.push(
      `${pid.slice(-4)} ready=${p?.translationReady ? 1 : 0} approved=${langs.length}/8 missing=${missing.join(",") || "-"}`,
    );
  }
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "nov09-products-coverage.txt"),
    out.join("\n"),
    "utf8",
  );
  console.log(`full-8: ${full}/${pids.length}`);
  console.log(
    out
      .filter((l) => !l.includes("missing=-") || l.includes("ready=0"))
      .join("\n"),
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
