// Crawler safety net: normalize specs of EVERY product in DB through the
// backend's own normalizer (same pipeline a fresh crawl passes through).
// Dry-run by default; --apply writes back only products whose specs changed.
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const { normalizeSpecs } = require(
  path.join(BACKEND, "src", "utils", "specNormalizer.js"),
);
const APPLY = process.argv.includes("--apply");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const products = mongoose.connection.db.collection("products");
  const docs = await products
    .find({}, { projection: { name: 1, specs: 1 } })
    .toArray();
  let changed = 0,
    fixed = 0;
  for (const p of docs) {
    if (!p.specs || typeof p.specs !== "object") continue;
    const normalized = normalizeSpecs(p.specs);
    const changedSpecs =
      JSON.stringify(p.specs) !== JSON.stringify(normalized);
    if (changedSpecs) {
      changed++;
      console.log(`${p._id} ${String(p.name).slice(0, 45)}`);
      console.log(`  OLD: ${JSON.stringify(p.specs).slice(0, 200)}`);
      console.log(`  NEW: ${JSON.stringify(normalized).slice(0, 200)}`);
      fixed++;
      if (APPLY)
        await products.updateOne(
          { _id: p._id },
          { $set: { specs: normalized } },
        );
    }
  }
  console.log(
    `products with non-normalized specs: ${changed} ${APPLY ? "(APPLIED)" : "(dry run — pass --apply)"}`,
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
