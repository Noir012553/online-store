// Read-only: evaluates every gate of getAssistantApprovalEligibility for the
// records that cannot be approved and prints which gate fails.
require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("./src/models/Product");
const ProductCatalogTranslationCache = require("./src/models/ProductCatalogTranslationCache");
const {
  QUALITY_THRESHOLD_FOR_APPROVAL,
} = require("./src/config/translationValidation");
// Re-implements the completeness gate the same way the controller does, but
// reports each failing sub-condition instead of a single boolean.
const getSpecEntries = (specs) => Object.entries(specs || {});
const getCanonicalSpecKey = (key) => String(key).trim().toLowerCase().replace(/\s+/g, "");
const containsNoInputTranslationResponse = (t) => !t || !t.name || !String(t.name).trim();
const completenessReport = (sourceProduct, translation) => {
  const fails = [];
  if ((translation.validationErrors || []).length > 0) fails.push("validationErrors not cleared");
  if (containsNoInputTranslationResponse(translation)) fails.push("no-input response");
  const required = ["name", "brand"];
  if (sourceProduct.description?.trim()) required.push("description");
  if (sourceProduct.technicalDescription?.trim()) required.push("technicalDescription");
  for (const f of required) if (!translation[f] || !String(translation[f]).trim()) fails.push(`missing ${f}`);
  const srcKeys = new Set(getSpecEntries(sourceProduct.specs).filter(([, v]) => v != null && String(v).trim()).map(([k]) => getCanonicalSpecKey(k)));
  const trKeys = new Set(getSpecEntries(translation.specs).filter(([, v]) => typeof v === "string" && v.trim()).map(([k]) => getCanonicalSpecKey(k)));
  for (const k of srcKeys) if (!trKeys.has(k)) fails.push(`missing spec ${k}`);
  return fails;
};

const KEYS = [
  ["6ad0d7c80069aece85a8c918", "en"],
  ["6ad0d7c80069aece85a8c919", "fr"],
  ["6ad0d7c80069aece85a8c91a", "fr"],
  ["6ad0d7c80069aece85a8c91c", "it"],
  ["6ad0d7c80069aece85a8c91c", "nl"],
  ["6ad0d7c80069aece85a8c91d", "nl"],
  ["6ad0d7c80069aece85a8c91f", "nl"],
  ["6ad0d7c80069aece85a8c920", "nl"],
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("threshold for approval:", QUALITY_THRESHOLD_FOR_APPROVAL);
  for (const [productId, lang] of KEYS) {
    const [product, translation] = await Promise.all([
      Product.findById(productId).lean(),
      ProductCatalogTranslationCache.findOne({
        entityId: productId,
        targetLang: lang,
      }).lean(),
    ]);
    console.log(`\n${productId}/${lang}`);
    if (!translation) {
      console.log("  NO TRANSLATION DOC");
      continue;
    }
    console.log(
      `  provider=${translation.provider}/${translation.providerSource} status=${translation.status} quality=${translation.qualityStatus} score=${translation.qualityScore}`,
    );
    console.log(`  errors=${JSON.stringify(translation.validationErrors)}`);
    if (product) {
      const fails = completenessReport(product, { ...translation, validationErrors: [] });
      console.log(`  completeness fails: ${fails.length ? fails.join("; ") : "none"}`);
      console.log(`  sourceSpecKeys=${JSON.stringify(Object.keys(product.specs || {}))}`);
      console.log(`  translatedSpecKeys=${JSON.stringify(Object.keys(translation.specs || {}))}`);
    } else {
      console.log("  PRODUCT NOT FOUND");
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
