// Diagnose remaining 19 pending nov06e records: read validationErrors from DB
// AND run the checkSourceLanguageLeak + checkMissingBrand on the payloads.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const TARGET_TAILS = [
  "c770",
  "c7fb",
  "c7fd",
  "c803",
  "c8a2",
  "c8b3",
  "c8c4",
  "c8c5",
  "c8c8",
  "c8db",
];
const recs = importData.records.filter((r) =>
  TARGET_TAILS.includes(r.productId.slice(-4)),
);

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  for (const rec of recs) {
    const doc = await cache.findOne(
      { entityId: rec.productId, targetLang: rec.targetLang },
      { projection: { validationErrors: 1 } },
    );
    const errs = (doc && doc.validationErrors) || [];
    const wl = validator.checkSourceLanguageLeak(
      rec.source.description,
      rec.translations.description || "",
      rec.targetLang,
      "product_description",
    );
    const mb = validator.checkMissingBrand(
      rec.source.description,
      rec.translations.description || "",
    );
    console.log(
      rec.productId.slice(-4) + "/" + rec.targetLang,
      "DB:",
      JSON.stringify(errs),
      "| leak:",
      wl ? wl.phrase : "-",
      "| brand:",
      mb ? mb.brand : "-",
    );
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
