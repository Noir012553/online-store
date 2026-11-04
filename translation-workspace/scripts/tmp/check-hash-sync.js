// Read-only: compare cached sourceHash vs current Product sourceHash.
// Uses the backend's own getProductTranslationSourceHash for exact parity
// with the read path in translationController.js. Never writes.
const path = require("path");
const WS = path.resolve(__dirname, "..", "..");
const ROOT = path.resolve(WS, "..");
const BACKEND = path.join(ROOT, "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const { getProductTranslationSourceHash } = require(
  path.join(BACKEND, "src", "utils", "productTranslationFingerprint.js"),
);

const LOCALES = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;

  const catalog = db.collection("product_catalog_translation_cache");
  const products = db.collection("products");

  // Load all products once, compute current hash per product
  const allProducts = await products
    .find(
      {},
      {
        projection: {
          name: 1,
          description: 1,
          brand: 1,
          specs: 1,
          technicalDescription: 1,
          descriptionImages: 1,
          promotions: 1,
        },
      },
    )
    .toArray();
  const hashById = new Map();
  for (const p of allProducts) {
    hashById.set(String(p._id), getProductTranslationSourceHash(p));
  }

  const staleByLang = {};
  let totalChecked = 0,
    totalStale = 0,
    totalMissingProduct = 0;
  const staleSamples = [];

  for (const lang of LOCALES) {
    const docs = await catalog
      .find(
        { targetLang: lang },
        {
          projection: { entityId: 1, sourceHash: 1, qualityStatus: 1 },
        },
      )
      .toArray();
    let stale = 0,
      missing = 0;
    for (const d of docs) {
      totalChecked++;
      const current = hashById.get(String(d.entityId));
      if (current === undefined) {
        missing++;
        totalMissingProduct++;
        continue;
      }
      if (d.sourceHash !== current) {
        stale++;
        totalStale++;
        if (staleSamples.length < 5) {
          staleSamples.push({
            entityId: String(d.entityId),
            lang,
            cached: (d.sourceHash || "").slice(0, 12),
            current: current.slice(0, 12),
            qualityStatus: d.qualityStatus,
          });
        }
      }
    }
    staleByLang[lang] = { docs: docs.length, stale, missingProduct: missing };
  }

  // Overall: how many products have ALL approved docs hash-current
  const mismatchSet = new Set();
  for (const lang of LOCALES) {
    const docs = await catalog
      .find(
        {
          targetLang: lang,
          status: "success",
          qualityStatus: "approved",
        },
        { projection: { entityId: 1, sourceHash: 1 } },
      )
      .toArray();
    for (const d of docs) {
      const current = hashById.get(String(d.entityId));
      if (current !== undefined && d.sourceHash !== current)
        mismatchSet.add(String(d.entityId));
    }
  }

  console.log("DB check (read-only) — sourceHash sync:");
  console.log("Products loaded for hashing:", allProducts.length);
  console.log("");
  for (const lang of LOCALES) {
    const s = staleByLang[lang];
    console.log(
      `  ${lang}: docs=${s.docs} stale=${s.stale} product-missing=${s.missingProduct}`,
    );
  }
  console.log("");
  console.log("Total catalog docs checked:", totalChecked);
  console.log("Total STALE (sourceHash mismatch):", totalStale);
  console.log(
    "Docs referencing a deleted/missing product:",
    totalMissingProduct,
  );
  console.log("Products with >=1 approved-but-stale locale:", mismatchSet.size);
  console.log("");
  if (staleSamples.length) {
    console.log("Stale samples (first 5):");
    staleSamples.forEach((s) => console.log("  ", JSON.stringify(s)));
  } else {
    console.log(
      "=> 100% hash-current. Approved translations all match current product source.",
    );
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
