// Read-only: figure out how ProductCatalogTranslationCache actually stores the
// product key, then report the real state of the batch file's records.
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");

const FILE =
  "E:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-import-10-products.json";
const MODEL = "product_catalog_translation_cache";
const PRODUCT_IDS = [
  "6ad0d7c80069aece85a8c917",
  "6ad0d7c80069aece85a8c918",
  "6ad0d7c80069aece85a8c919",
  "6ad0d7c80069aece85a8c91a",
  "6ad0d7c80069aece85a8c91b",
  "6ad0d7c80069aece85a8c91c",
  "6ad0d7c80069aece85a8c91d",
  "6ad0d7c80069aece85a8c91e",
  "6ad0d7c80069aece85a8c91f",
  "6ad0d7c80069aece85a8c920",
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const col = db.collection(MODEL);

  console.log("total docs in collection:", await col.countDocuments({}));
  const sample = await col.findOne({});
  if (sample) {
    console.log("sample keys:", Object.keys(sample).join(", "));
    console.log(
      "sample entityId type:",
      typeof sample.entityId,
      "| entityType:",
      sample.entityType,
    );
  }

  // Which entityType does the product catalog use?
  const types = await col
    .aggregate([{ $group: { _id: "$entityType", n: { $sum: 1 } } }])
    .toArray();
  console.log("entityType buckets:", JSON.stringify(types));

  // Do the file's 10 products exist at all in this collection?
  for (const id of PRODUCT_IDS) {
    const asObj = await col.countDocuments({ entityId: new mongoose.Types.ObjectId(id) });
    const asStr = await col.countDocuments({ entityId: id });
    console.log(`  ${id} -> ObjectId:${asObj} string:${asStr}`);
  }

  const newest = await col.find({}).sort({ updatedAt: -1 }).limit(3).project({ entityId: 1, entityType: 1, targetLang: 1, provider: 1, providerSource: 1, status: 1, qualityStatus: 1, qualityScore: 1, updatedAt: 1 }).toArray();
  console.log("newest docs:", JSON.stringify(newest, null, 1));

  // Compare matching by ObjectId vs string
  const idObjs = PRODUCT_IDS.map((id) => new mongoose.Types.ObjectId(id));
  console.log(
    "match by ObjectId _id:",
    await col.countDocuments({ entityId: { $in: idObjs } }),
  );
  console.log(
    "match by string entityId:",
    await col.countDocuments({ entityId: { $in: PRODUCT_IDS } }),
  );

  const docs = await col
    .find({ entityId: { $in: [...idObjs, ...PRODUCT_IDS] } })
    .toArray();
  console.log("docs for our 10 products:", docs.length);
  if (docs.length) {
    console.log(
      "  example:",
      JSON.stringify({
        entityId: String(docs[0].entityId),
        entityType: docs[0].entityType,
        targetLang: docs[0].targetLang,
        provider: docs[0].provider,
        providerSource: docs[0].providerSource,
        status: docs[0].status,
        qualityStatus: docs[0].qualityStatus,
        qualityScore: docs[0].qualityScore,
        validationErrors: docs[0].validationErrors,
      }),
    );
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error("DB ERROR:", e.message);
  process.exit(1);
});
