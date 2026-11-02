// Diagnose raw cache docs for a few nov09 products (all locales, all statuses).
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
  const out = [];
  for (const pid of pids.slice(0, 4)) {
    const docs = await cache
      .find(
        { entityId: pid },
        {
          projection: {
            targetLang: 1,
            status: 1,
            qualityStatus: 1,
            provider: 1,
            providerSource: 1,
            qualityScore: 1,
            validationErrors: 1,
            updatedAt: 1,
          },
        },
      )
      .toArray();
    out.push(`=== ${pid.slice(-4)} (${docs.length} docs)`);
    for (const x of docs.sort((a, b) =>
      a.targetLang.localeCompare(b.targetLang),
    )) {
      out.push(
        `  ${x.targetLang} status=${x.status} q=${x.qualityStatus} prov=${x.provider}/${x.providerSource} score=${x.qualityScore} errs=${(x.validationErrors || []).length} upd=${x.updatedAt && new Date(x.updatedAt).toISOString().slice(0, 16)}`,
      );
    }
  }
  // also counts over all 36 pids
  const oid = pids.map((p) => mongoose.mongo.ObjectId.createFromHexString(p));
  const agg = await cache
    .aggregate([
      { $match: { entityId: { $in: pids } } },
      {
        $group: { _id: { q: "$qualityStatus", st: "$status" }, n: { $sum: 1 } },
      },
    ])
    .toArray();
  out.push("=== aggregates: " + JSON.stringify(agg));
  const newProv = await cache.countDocuments({
    entityId: { $in: pids },
    provider: "assistant",
    providerSource: "assistant_batch",
  });
  out.push(`assistant/assistant_batch docs across 36 products: ${newProv}`);
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "diag-nov09-db-state.txt"),
    out.join("\n"),
    "utf8",
  );
  console.log(out.join("\n"));
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
