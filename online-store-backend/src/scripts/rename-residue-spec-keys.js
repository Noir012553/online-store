/**
 * Rename residue spec keys in catalog caches to canonical keys.
 * Handles keys whose canonical key exists in the product's specs:
 *   - polling_rate -> pollRate (4 docs)
 *   - key "ram" in a doc whose product does NOT have "ram" but has another key canonicalizing to "ram"
 * Dry-run by default; --apply writes. Renames only move the value, never edit content.
 */
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
const Product = require("../models/Product");
const ProductCatalogTranslationCache = require("../models/ProductCatalogTranslationCache");
const {
  getCanonicalSpecKey,
} = require("../services/specKeyTranslationService");

const apply = process.argv.includes("--apply");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  const products = await Product.find({ isDeleted: false })
    .select("_id specs")
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const caches = await ProductCatalogTranslationCache.find({}).lean();

  const ops = [];
  let residueDocs = 0;
  for (const c of caches) {
    const p = productById.get(String(c.entityId));
    if (!p) continue;
    const productCanonical = new Map();
    Object.keys(p.specs || {}).forEach((k) => {
      const ck = getCanonicalSpecKey(k);
      if (ck) productCanonical.set(ck, k);
    });
    const newSpecs = { ...c.specs };
    let changed = false;
    Object.keys(c.specs || {}).forEach((k) => {
      const ck = getCanonicalSpecKey(k);
      if (!ck) return;
      if (
        productCanonical.has(ck) &&
        !Object.prototype.hasOwnProperty.call(
          newSpecs,
          productCanonical.get(ck),
        ) &&
        k !== productCanonical.get(ck)
      ) {
        newSpecs[productCanonical.get(ck)] = newSpecs[k];
        delete newSpecs[k];
        changed = true;
      }
    });
    if (changed) {
      residueDocs += 1;
      const renameSummary = Object.keys(c.specs || {}).filter(
        (k) => !(k in newSpecs),
      );
      console.log(
        `residue: ${c.entityId} ${c.targetLang} rename ${renameSummary.join(",")}`,
      );
      ops.push({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { specs: newSpecs } },
        },
      });
    }
  }
  console.log(JSON.stringify({ residueDocs, ops: ops.length }, null, 2));
  if (apply && ops.length > 0) {
    const result = await ProductCatalogTranslationCache.bulkWrite(ops, {
      ordered: false,
    });
    console.log(
      `matched=${result.matchedCount} modified=${result.modifiedCount}`,
    );
  } else if (!apply) {
    console.log("Dry-run only. Re-run with --apply.");
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exitCode = 1;
});
