// Diagnostic: fetch an approved doc for product c728 (AULA F87 TM) — the user
// reported "Chat lieu vo:" appearing untranslated. Dump tech + specs fields.
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const products = mongoose.connection.db.collection("products");
  const p = await products.findOne(
    { name: /F87/ },
    { projection: { name: 1 } },
  );
  console.log("product:", p && p.name, p && p._id.toString());
  if (p) {
    const cache = mongoose.connection.db.collection(
      "product_catalog_translation_cache",
    );
    for (const lang of ["en", "fr"]) {
      const doc = await cache.findOne({
        entityId: p._id.toString(),
        targetLang: lang,
      });
      if (!doc) continue;
      console.log(`\n=== ${lang} ===`);
      console.log("name:", doc.name);
      console.log(
        "tech:",
        JSON.stringify(doc.technicalDescription).slice(0, 400),
      );
      console.log("specs:", JSON.stringify(doc.specs).slice(0, 400));
      const m = (doc.description || "").match(/.{0,80}Chat lieu.{0,80}/i);
      if (m) console.log("desc ctx:", JSON.stringify(m[0]));
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
