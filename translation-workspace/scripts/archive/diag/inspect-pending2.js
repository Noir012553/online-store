// Verify the state of the 10 supposedly-pending records.
const fs = require("fs");
const path = require("path");
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
  const cache = db.collection("product_catalog_translation_cache");
  const pending = JSON.parse(
    fs.readFileSync(path.join(WS, "logs", "nov06d-pending.json"), "utf8"),
  );
  const importData = JSON.parse(
    fs.readFileSync(
      path.join(WS, "data", "import", "assistant-batch-import-nov06d.json"),
      "utf8",
    ),
  );
  const byTail = new Map(
    importData.records.map((r) => [
      r.productId.slice(-4) + ":" + r.targetLang,
      r.productId,
    ]),
  );
  for (const p of pending) {
    const fullPid = byTail.get(p.pid + ":" + p.lang);
    if (!fullPid) {
      console.log(p.pid + "/" + p.lang, "NOT-IN-BATCH");
      continue;
    }
    const docs = await cache
      .find(
        { entityId: fullPid, targetLang: p.lang },
        { projection: { provider: 1, qualityStatus: 1, validationErrors: 1 } },
      )
      .toArray();
    console.log(
      p.pid + "/" + p.lang,
      JSON.stringify(
        docs.map((d) => ({
          p: d.provider,
          q: d.qualityStatus,
          e: d.validationErrors,
        })),
        null,
        1,
      ),
    );
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
