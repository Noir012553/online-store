/**
 * Refresh stale sourceHash in ProductCatalogTranslationCache WITHOUT retranslating.
 *
 * Safe-by-default design:
 *  - Dry-run by default. Pass --apply to write.
 *  - For each stale catalog cache (product/locale), refresh sourceHash ONLY if every
 *    translated field's stored fieldSourceHashes still matches the CURRENT product source
 *    field hash (i.e. per-field content unchanged — only the whole-product fingerprint is stale).
 *  - Caches whose per-field content changed are reported and skipped (they need real retranslation).
 *  - Also re-aliases Vietnamese spec keys in cached specs to canonical keys when the cache key
 *    canonicalizes to the same canonical key as a product spec key (fix B companion), so
 *    missing_specs caused by key-name mismatch resolves. Only applied when value text matches
 *    the product source spec value OR differs because it's a translation — we keep cache value.
 *
 * Usage:
 *   node scripts/refresh-stale-catalog-hashes.js            # dry-run report
 *   node scripts/refresh-stale-catalog-hashes.js --apply    # write changes
 *   node scripts/refresh-stale-catalog-hashes.js --apply --shutdown  # stop port 5000 backend after
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
  getProductTranslationSourceHash,
  getProductTranslationFieldHashes,
  getProductTranslationFieldKey,
  getProductTranslationFieldHash,
} = require("../utils/productTranslationFingerprint");
const {
  getCanonicalSpecKey,
} = require("../services/specKeyTranslationService");
const {
  refreshTranslationReadiness,
} = require("../services/translationHelper");

const LANGS = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const shutdown = args.includes("--shutdown");

const canonicalizeSpecs = (specs) => {
  const out = {};
  Object.entries(specs || {}).forEach(([key, value]) => {
    const canonical = getCanonicalSpecKey(key);
    if (canonical && String(value ?? "").trim()) out[canonical] = value;
  });
  return out;
};

(async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);

  const products = await Product.find({ isDeleted: false })
    .select(
      "_id name description brand specs technicalDescription descriptionImages promotions",
    )
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const ids = products.map((p) => p._id);
  const caches = await ProductCatalogTranslationCache.find({
    entityId: { $in: ids.map(String) },
    targetLang: { $in: LANGS },
  }).lean();

  let staleCount = 0;
  let refreshable = 0;
  let fieldChanged = 0;
  let specKeyFixed = 0;
  let specKeyOnly = 0;
  const skipped = [];
  const bulkOps = [];

  for (const cache of caches) {
    const product = productById.get(String(cache.entityId));
    if (!product) continue;
    const expectedHash = getProductTranslationSourceHash(product);
    if (cache.sourceHash === expectedHash) continue;
    staleCount += 1;

    const currentFieldHashes = getProductTranslationFieldHashes(product);
    const storedFieldHashes = cache.fieldSourceHashes || {};
    // Field key comparison: the field hash INCLUDES the path, so a spec KEY RENAME
    // (size vs kich_thuoc_man_hinh) changes the hash even though the value describes
    // the same spec. Fallback comparison is path-INDEPENDENT: rebuild the plain value
    // hash of every current source string; a stored field counts as unchanged when its
    // stored hash equals the current path+value hash OR any current value hash.
    // (stored field hash = sha256(JSON.stringify([path, source])) — the source segment
    // alone is hashed as sha256(String(source)); we recompute candidate value hashes
    // from current source the same way getFieldHash would with an empty path.)
    const changedFields = [];
    Object.entries(storedFieldHashes).forEach(([fieldKey, storedHash]) => {
      if (currentFieldHashes[fieldKey] === storedHash) return; // exact match
      let parsedPath = null;
      try { parsedPath = JSON.parse(fieldKey); } catch { /* not JSON */ }
      if (Array.isArray(parsedPath) && parsedPath[0] === 'specs' && typeof parsedPath[1] === 'string') {
        // spec field: locate the current spec value by canonical key equivalence
        const storedCanonical = getCanonicalSpecKey(parsedPath[1]);
        const match = Object.entries(product.specs || {}).find(([key]) => getCanonicalSpecKey(key) === storedCanonical);
        if (match && typeof match[1] === 'string') {
          const rehashed = getProductTranslationFieldHash(parsedPath, match[1]);
          if (rehashed === storedHash) return; // same value under renamed key — content unchanged
        }
      }
      changedFields.push(fieldKey);
    });

    if (changedFields.length > 0) {
      fieldChanged += 1;
      skipped.push({
        productId: String(cache.entityId),
        lang: cache.targetLang,
        changedFields: changedFields.slice(0, 5),
      });
      continue;
    }

    // Per-field content matches: whole-product fingerprint is stale only because of
    // unhashed source areas (e.g. promotions _id/order) — safe to refresh the hash.
    const update = { $set: { sourceHash: expectedHash } };

    // Spec key canonicalization companion fix: rename cached spec keys to canonical keys
    // when the product uses the canonical name and the cache stores a Vietnamese alias.
    const productSpecKeys = new Set(
      Object.entries(product.specs || {})
        .filter(([, v]) => String(v ?? "").trim())
        .map(([k]) => getCanonicalSpecKey(k))
        .filter(Boolean),
    );
    const canonicalCacheSpecs = canonicalizeSpecs(cache.specs || {});
    const cacheCanonicalKeys = Object.keys(canonicalCacheSpecs);
    const cacheAliases = Object.keys(cache.specs || {});
    const needsSpecRename =
      cacheCanonicalKeys.length !== cacheAliases.length ||
      cacheCanonicalKeys.some((k) => !(k in (cache.specs || {})));
    if (
      needsSpecRename &&
      cacheCanonicalKeys.length > 0 &&
      cacheCanonicalKeys.every((k) => productSpecKeys.has(k))
    ) {
      update.$set.specs = canonicalCacheSpecs;
      specKeyFixed += 1;
    }
    const remainingMissing = [...productSpecKeys].filter(
      (k) => !(k in canonicalCacheSpecs),
    );
    if (remainingMissing.length === 0 && changedFields.length === 0)
      specKeyOnly += 1;

    bulkOps.push({
      updateOne: {
        filter: { _id: cache._id },
        update,
      },
    });
    refreshable += 1;
  }

  console.log(
    JSON.stringify(
      {
        totalCaches: caches.length,
        staleCount,
        refreshable,
        skippedFieldContentChanged: fieldChanged,
        specKeysRenamed: specKeyFixed,
      },
      null,
      2,
    ),
  );
  if (skipped.length > 0) {
    console.log("Skipped samples (field content truly changed):");
    skipped.slice(0, 10).forEach((s) => console.log(JSON.stringify(s)));
  }

  if (apply && bulkOps.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < bulkOps.length; i += CHUNK) {
      const result = await ProductCatalogTranslationCache.bulkWrite(
        bulkOps.slice(i, i + CHUNK),
        { ordered: false },
      );
      console.log(
        `Chunk ${i / CHUNK + 1}: matched=${result.matchedCount} modified=${result.modifiedCount}`,
      );
    }
    console.log("Refreshing translation readiness for affected products...");
    const affectedIds = [
      ...new Set(bulkOps.map((op) => op.updateOne.filter._id.entityId)),
    ];
    // resolve entityIds via cache docs we already have
    const refreshedIds = [
      ...new Set(
        caches
          .filter((c) =>
            bulkOps.some(
              (op) => String(op.updateOne.filter._id) === String(c._id),
            ),
          )
          .map((c) => String(c.entityId)),
      ),
    ];
    void affectedIds;
    const readiness = await refreshTranslationReadiness(refreshedIds);
    console.log(JSON.stringify(readiness, null, 2));
  } else if (!apply) {
    console.log("Dry-run only. Re-run with --apply to write changes.");
  } else {
    console.log("Nothing to update.");
  }

  await mongoose.disconnect();
  if (shutdown) {
    const { execSync } = require("child_process");
    try {
      const output = execSync(
        'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"',
      )
        .toString()
        .trim();
      if (output) {
        output
          .split(/\s+/)
          .filter(Boolean)
          .forEach((pid) => {
            try {
              process.kill(Number(pid));
              console.log(`Stopped backend pid ${pid}`);
            } catch {
              /* already gone */
            }
          });
      }
    } catch {
      /* port not listening */
    }
  }
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exitCode = 1;
});
