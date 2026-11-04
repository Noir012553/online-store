// Backup catalog cache collection to JSON before hash refresh (write-phase safety)
const path = require("path");
try {
  require("dotenv").config({
    path: path.resolve(__dirname, "../../.env"),
    quiet: true,
  });
} catch (e) {
  if (e.code !== "MODULE_NOT_FOUND") throw e;
}
const mongoose = require("mongoose");
const fs = require("fs");
const ProductCatalogTranslationCache = require("../models/ProductCatalogTranslationCache");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const snapshot = await ProductCatalogTranslationCache.find({}).lean();
  const file = path.resolve(
    __dirname,
    "../../backups",
    `product-catalog-cache-pre-hash-refresh-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snapshot));
  console.log("backup docs:", snapshot.length, "->", file);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exitCode = 1;
});
