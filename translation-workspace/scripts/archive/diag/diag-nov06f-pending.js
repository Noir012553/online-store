// Diagnose pending/not_eligible nov06f records with validationErrors from DB.
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
  "assistant-batch-import-nov06f.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const seen = new Set();

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  let pending = 0;
  const lines = [];
  for (const r of importData.records) {
    const key = r.productId + "/" + r.targetLang;
    if (seen.has(key)) continue;
    seen.add(key);
    const doc = await cache.findOne(
      { entityId: r.productId, targetLang: r.targetLang },
      {
        projection: { validationErrors: 1, qualityScore: 1, qualityStatus: 1 },
      },
    );
    if (doc && (doc.qualityStatus || "") !== "approved") {
      pending++;
      const line =
        key +
        " " +
        JSON.stringify(doc.validationErrors || []) +
        " score " +
        doc.qualityScore;
      lines.push(line);
      console.log(line);
    }
  }
  console.log("not-approved total:", pending);
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "diag-nov06f-pending.txt"),
    lines.join("\n") + `\nnot-approved total: ${pending}\n`,
    "utf8",
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
