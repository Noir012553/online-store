// After import, read cache docs for the not_eligible tails to see why approve skipped.
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
  const cache = mongoose.connection.db.collection(
    "product_catalog_translation_cache",
  );
  const docs = await cache
    .find(
      {
        entityId: { $regex: /(c645|c6c8|c6ca)$/, $options: "i" },
        status: "success",
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
          updatedAt: 1,
        },
      },
    )
    .sort({ entityId: 1, targetLang: 1 })
    .toArray();
  const out = docs.map(
    (x) =>
      `${x.entityId.slice(-4)}/${x.targetLang} q=${x.qualityStatus} prov=${x.provider}/${x.providerSource || "-"} score=${x.qualityScore} errs=${JSON.stringify(x.validationErrors)} upd=${x.updatedAt && new Date(x.updatedAt).toISOString().slice(0, 16)}`,
  );
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "diag-nov09-elig-db.txt"),
    out.join("\n"),
    "utf8",
  );
  console.log(out.join("\n"));
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
