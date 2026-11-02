// List all pending/needs_retranslate cache docs across the 36 nov09 products
// with their validation errors, so we know exactly what blocks approval.
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
  const cache = mongoose.connection.db.collection(
    "product_catalog_translation_cache",
  );
  const docs = await cache
    .find(
      {
        entityId: { $in: pids },
        qualityStatus: { $in: ["pending", "needs_retranslate"] },
      },
      {
        projection: {
          entityId: 1,
          targetLang: 1,
          qualityStatus: 1,
          provider: 1,
          providerSource: 1,
          qualityScore: 1,
          validationErrors: 1,
        },
      },
    )
    .sort({ entityId: 1, targetLang: 1 })
    .toArray();
  const out = docs.map(
    (x) =>
      `${x.entityId.slice(-4)}/${x.targetLang} q=${x.qualityStatus} prov=${x.provider}/${x.providerSource || "-"} score=${x.qualityScore} errs=${JSON.stringify(x.validationErrors)}`,
  );
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "nov09-blocked-records.txt"),
    out.join("\n"),
    "utf8",
  );
  console.log(`total: ${out.length}`);
  console.log(out.slice(0, 60).join("\n"));
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
