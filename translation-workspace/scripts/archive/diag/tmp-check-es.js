const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const ids = [
  "6ad0cde40069aece85a8c694",
  "6ad0d25d0069aece85a8c7b8",
  "6ad0cb680069aece85a8c61c",
  "6ad0cb680069aece85a8c625",
];
(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const c = mongoose.connection.db.collection(
    "product_catalog_translation_cache",
  );
  const docs = await c
    .find(
      { entityId: { $in: ids }, targetLang: { $in: ["es", "nl", "sv"] } },
      {
        projection: {
          entityId: 1,
          targetLang: 1,
          qualityStatus: 1,
          qualityScore: 1,
          provider: 1,
          validationErrors: 1,
        },
      },
    )
    .toArray();
  console.log(JSON.stringify(docs, null, 1));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
