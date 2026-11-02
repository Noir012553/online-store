// Read-only: inspect one record in detail (productId + lang from CLI args).
const path = require("path");
const cfg = require("./config");
const mongoose = require(path.join(cfg.BACKEND_MODULES, "mongoose"));
const Product = require(path.join(cfg.BACKEND, "src", "models", "Product"));
const ProductCatalogTranslationCache = require(
  path.join(cfg.BACKEND, "src", "models", "ProductCatalogTranslationCache"),
);
const {
  getProductTranslationSourceHash,
} = require(
  path.join(
    cfg.BACKEND,
    "src",
    "utils",
    "productTranslationFingerprint",
  ),
);

(async () => {
  await cfg.connectMongoose();
  const [productId, lang] = process.argv.slice(2);
  const [product, translation] = await Promise.all([
    Product.findById(productId).lean(),
    ProductCatalogTranslationCache.findOne({
      entityId: productId,
      targetLang: lang,
    }).lean(),
  ]);
  const out = [];
  out.push(`product: ${productId}/${lang}`);
  out.push(`provider: ${translation.provider}/${translation.providerSource}`);
  out.push(
    `status: ${translation.status} quality: ${translation.qualityStatus} score: ${translation.qualityScore}`,
  );
  out.push(`validationErrors: ${JSON.stringify(translation.validationErrors)}`);
  out.push(
    `sourceHash match: ${translation.sourceHash === getProductTranslationSourceHash(product)}`,
  );
  out.push(
    `specs keys source: ${JSON.stringify(Object.keys(product.specs || {}))}`,
  );
  out.push(
    `specs keys translation: ${JSON.stringify(Object.keys(translation.specs || {}))}`,
  );
  out.push(`updatedAt: ${translation.updatedAt?.toISOString()}`);
  out.push(`name translation: ${translation.name}`);
  console.log(out.join("\n"));
  require("fs").writeFileSync(
    path.join(cfg.WS, "logs", "inspect-record-last.txt"),
    out.join("\n") + "\n",
    "utf8",
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
