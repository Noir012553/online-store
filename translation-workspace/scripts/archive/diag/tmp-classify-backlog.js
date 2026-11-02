// Temporary read-only classification of remaining storefront backlog jobs by reason.
const path = require("path");
require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "node_modules",
    "dotenv",
  ),
).config({
  path: path.join(__dirname, "..", "..", "online-store-backend", ".env"),
  quiet: true,
});
const mongoose = require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "node_modules",
    "mongoose",
  ),
);
const Product = require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "src",
    "models",
    "Product",
  ),
);
const ProductCatalogTranslationCache = require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "src",
    "models",
    "ProductCatalogTranslationCache",
  ),
);
const { SUPPORTED_LANGUAGES } = require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "src",
    "config",
    "languageInventory",
  ),
);
const { getProductTranslationSourceHash } = require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "src",
    "utils",
    "productTranslationFingerprint",
  ),
);
const { getTranslationReadyProductIds } = require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "src",
    "services",
    "translationHelper",
  ),
);
const { getCanonicalSpecKey } = require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "src",
    "services",
    "specKeyTranslationService",
  ),
);

// Mirror of script's readiness/reasons logic (kept identical, read-only)
const hasText = (v) => typeof v === "string" && v.trim().length > 0;
const getSpecEntries = (s) =>
  s && typeof s === "object" ? Object.entries(s) : [];
const requiredLanguages = SUPPORTED_LANGUAGES.map(({ code }) => code).filter(
  (c) => c !== "vi",
);

const isReady = (product, t, hash) => {
  if (
    !t ||
    t.status !== "success" ||
    t.qualityStatus !== "approved" ||
    t.sourceHash !== hash ||
    (t.validationErrors || []).length > 0 ||
    !hasText(t.name) ||
    !hasText(t.brand)
  )
    return false;
  if (hasText(product.description) && !hasText(t.description)) return false;
  const tk = new Set(
    getSpecEntries(t.specs)
      .filter(([, v]) => hasText(v))
      .map(([k]) => getCanonicalSpecKey(k))
      .filter(Boolean),
  );
  return getSpecEntries(product.specs)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim())
    .map(([k]) => getCanonicalSpecKey(k))
    .filter(Boolean)
    .every((k) => tk.has(k));
};

const reasons = (product, t, hash) => {
  const r = [];
  if (!t) return ["missing_translation"];
  if (t.status !== "success") r.push("status_not_success");
  if (t.qualityStatus !== "approved") r.push("quality_not_approved");
  if (t.sourceHash !== hash) r.push("stale_source_hash");
  if ((t.validationErrors || []).length > 0) r.push(...t.validationErrors);
  if (!hasText(t.name) || !hasText(t.brand))
    r.push("missing_required_translation_fields");
  if (hasText(product.description) && !hasText(t.description))
    r.push("missing_description");
  const tk = new Set(
    getSpecEntries(t.specs)
      .filter(([, v]) => hasText(v))
      .map(([k]) => getCanonicalSpecKey(k))
      .filter(Boolean),
  );
  const missing = getSpecEntries(product.specs)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim())
    .map(([k]) => getCanonicalSpecKey(k))
    .filter(Boolean)
    .filter((k) => !tk.has(k));
  if (missing.length) r.push(`missing_specs:${missing.join(",")}`);
  return [...new Set(r)];
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const products = await Product.find({ isDeleted: false })
    .select(
      "_id name brand description specs technicalDescription descriptionImages promotions",
    )
    .sort({ _id: 1 })
    .lean();
  const ids = products.map((p) => String(p._id));
  const translations = await ProductCatalogTranslationCache.find({
    entityId: { $in: ids },
    targetLang: { $in: requiredLanguages },
  })
    .select(
      "entityId targetLang sourceHash status qualityStatus validationErrors name brand description specs provider",
    )
    .lean();
  const byKey = new Map(
    translations.map((t) => [
      JSON.stringify([String(t.entityId), t.targetLang]),
      t,
    ]),
  );
  const readyIds = await getTranslationReadyProductIds(products);

  const errorCounts = {};
  const productCountByError = {};
  const providerByJob = {};
  let jobs = 0;
  const staleSpecDetails = {};

  for (const p of products) {
    const pid = String(p._id);
    if (readyIds.has(pid)) continue;
    const hash = getProductTranslationSourceHash(p);
    for (const lang of requiredLanguages) {
      const t = byKey.get(JSON.stringify([pid, lang]));
      if (isReady(p, t, hash)) continue;
      jobs++;
      const rs = reasons(p, t, hash);
      const provider = t?.provider || "(none)";
      for (const reason of rs) {
        const base = reason.startsWith("missing_specs:")
          ? "missing_specs"
          : reason;
        errorCounts[base] = (errorCounts[base] || 0) + 1;
        if (!productCountByError[base]) productCountByError[base] = new Set();
        productCountByError[base].add(pid);
        if (reason.startsWith("missing_specs:")) {
          for (const spec of reason.slice("missing_specs:".length).split(",")) {
            staleSpecDetails[spec] = (staleSpecDetails[spec] || 0) + 1;
          }
        }
      }
      providerByJob[provider] = (providerByJob[provider] || 0) + 1;
    }
  }

  console.log("total jobs:", jobs);
  console.log("\nerrors by frequency (job-level):");
  Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) =>
      console.log(
        `  ${k}: ${v} jobs / ${productCountByError[k].size} products`,
      ),
    );
  console.log("\nmissing_specs breakdown:", staleSpecDetails);
  console.log("\nprovider mix:", providerByJob);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
