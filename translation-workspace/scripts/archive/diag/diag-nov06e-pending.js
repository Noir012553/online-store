// Diagnose pending not_eligible records from DB (nov06e batch).
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const fs = require("fs");
const IMPORT = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  let pending = 0;
  const lines = [];
  for (const r of importData.records) {
    const doc = await cache.findOne(
      { entityId: r.productId, targetLang: r.targetLang },
      {
        projection: { validationErrors: 1, qualityScore: 1, qualityStatus: 1 },
      },
    );
    if (doc && doc.qualityStatus !== "approved") {
      pending++;
      const line = `${r.productId.slice(-4)}/${r.targetLang} ${JSON.stringify(doc.validationErrors || [])} score=${doc.qualityScore} status=${doc.qualityStatus}`;
      lines.push(line);
      console.log(line);
    }
  }
  console.log("pending total:", pending);
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "diag-nov06e-pending.txt"),
    lines.join("\n"),
    "utf8",
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
