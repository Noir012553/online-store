// Export an assistant batch for the next group of products that still have
// missing / not-approved locale slots. Read-only vs DB; writes:
//   data/export/assistant-batch-next.json  (records with EMPTY translations)
//   data/sources-for-translation-next.txt  (verbatim source text for human translation)
// Hash is computed exactly like backend getProductTranslationSourceHash
// (sha256 of sorted-JSON of the translation source object).
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const BACKEND_DIR = path.join(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND_DIR, "node_modules", "dotenv")).config({
  path: path.join(BACKEND_DIR, ".env"),
});
const mongoose = require(path.join(BACKEND_DIR, "node_modules", "mongoose"));

const CACHE_COLLECTION = "product_catalog_translation_cache";
const LOCALES = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];
const MAX_PRODUCTS = Number(process.env.MAX_PRODUCTS || 10);

// Mirror of backend src/utils/productTranslationFingerprint.js
const sortObject = (value) => {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((r, k) => {
      r[k] = sortObject(value[k]);
      return r;
    }, {});
};
const isEmptyAlt = (v) =>
  v == null || String(v).trim() === "" || String(v).trim() === "0";
const normalizeImage = (image) => {
  if (!image || typeof image !== "object" || Array.isArray(image)) return image;
  if (String(image.alt ?? "").trim() !== "0") return image;
  return { ...image, alt: null };
};
const getSource = (p = {}) => ({
  name: p.name ?? "",
  description: p.description ?? "",
  brand: p.brand ?? "",
  specs: p.specs ?? {},
  technicalDescription: p.technicalDescription ?? "",
  descriptionImages: (p.descriptionImages ?? []).map(normalizeImage),
  promotions: p.promotions ?? [],
});
const hashOf = (product) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(sortObject(getSource(product))))
    .digest("hex");

(async () => {
  if (!process.env.MONGO_URI)
    throw new Error("MONGO_URI is not set (check backend .env)");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const products = db.collection("products");
  const cache = db.collection(CACHE_COLLECTION);

  // Not-ready products, ordered by _id for a stable next-batch cut
  const notReady = await products
    .find({ translationReady: { $ne: true } }, { projection: { _id: 1 } })
    .sort({ _id: 1 })
    .toArray();
  console.log("not-ready products:", notReady.length);

  const cacheDocs = await cache
    .find(
      { entityId: { $in: notReady.map((p) => String(p._id)) } },
      {
        projection: {
          entityId: 1,
          targetLang: 1,
          qualityStatus: 1,
          qualityScore: 1,
        },
      },
    )
    .toArray();
  const byProduct = new Map();
  for (const c of cacheDocs) {
    if (!byProduct.has(c.entityId)) byProduct.set(c.entityId, new Map());
    byProduct.get(c.entityId).set(c.targetLang, c);
  }

  // Pick products that need at least one locale, first MAX_PRODUCTS
  const picked = [];
  for (const p of notReady) {
    const id = String(p._id);
    const cMap = byProduct.get(id) || new Map();
    const needed = LOCALES.filter((l) => {
      const c = cMap.get(l);
      return !c || c.qualityStatus !== "approved";
    });
    if (needed.length) picked.push({ id, needed });
    if (picked.length >= MAX_PRODUCTS) break;
  }
  console.log(
    "picked products:",
    picked.length,
    "->",
    picked.map((x) => `${x.id}(${x.needed.join(",")})`).join(" | "),
  );

  // Fetch full product docs
  const { ObjectId } = require(
    path.join(
      BACKEND_DIR,
      "node_modules",
      "mongoose",
      "node_modules",
      "mongodb",
    ),
  );
  const oidIds = picked.map((x) => ObjectId.createFromHexString(x.id));
  const docs = await products.find({ _id: { $in: oidIds } }).toArray();
  const docMap = new Map(docs.map((d) => [d._id.toString(), d]));

  const records = [];
  const sourcesTxt = [];
  const emptyTranslations = (src) => ({
    name: "",
    description: "",
    brand: "",
    specs: {},
    technicalDescription: "",
    descriptionImages: (src.descriptionImages || []).map((img) => ({
      url: img.url,
      alt: "",
    })),
    promotions: (src.promotions || []).map((p) => ({ ...p })),
  });

  for (const { id, needed } of picked) {
    const doc = docMap.get(id);
    if (!doc) {
      console.error("MISSING product doc:", id);
      continue;
    }
    const src = getSource(doc);
    const hash = hashOf(doc);
    for (const lang of needed) {
      records.push({
        productId: id,
        targetLang: lang,
        sourceHash: hash,
        fields: [
          "name",
          "description",
          "brand",
          "specs",
          "technicalDescription",
          "descriptionImages",
          "promotions",
        ],
        source: src,
        translations: emptyTranslations(src),
      });
    }
    // Human-readable source text for translation
    sourcesTxt.push(`===== PRODUCT ${id} =====`);
    sourcesTxt.push(`LANGS: ${needed.join(",")}`);
    sourcesTxt.push(`NAME: ${src.name}`);
    sourcesTxt.push(`BRAND: ${src.brand}`);
    sourcesTxt.push(`SPECS (key=value):`);
    for (const [k, v] of Object.entries(src.specs || {}))
      sourcesTxt.push(`  ${k} = ${v}`);
    sourcesTxt.push(`TECH_DESCRIPTION (verbatim):`);
    sourcesTxt.push(src.technicalDescription || "(empty)");
    sourcesTxt.push(`DESCRIPTION (verbatim):`);
    sourcesTxt.push(src.description || "(empty)");
    sourcesTxt.push(`IMAGE_ALTS:`);
    (src.descriptionImages || []).forEach((img, i) =>
      sourcesTxt.push(`  [${i}] ${img.alt || "(none)"}`),
    );
    if (src.promotions && src.promotions.length) {
      sourcesTxt.push(`PROMOTIONS:`);
      src.promotions.forEach((p, i) =>
        sourcesTxt.push(
          `  [${i}] type=${p.type} title="${p.title}" giftProductName="${p.giftProductName}" scope="${p.scope}" discountText="${p.discountText}"`,
        ),
      );
    }
    sourcesTxt.push("");
  }

  const exportPath = path.join(
    __dirname,
    "..",
    "data",
    "export",
    "assistant-batch-next.json",
  );
  const sourcesPath = path.join(
    __dirname,
    "..",
    "data",
    "sources-for-translation-next.txt",
  );
  fs.mkdirSync(path.dirname(exportPath), { recursive: true });
  fs.writeFileSync(
    exportPath,
    JSON.stringify({ workflow: "assistant_batch", records }, null, 2),
    "utf8",
  );
  fs.writeFileSync(sourcesPath, sourcesTxt.join("\n"), "utf8");
  console.log(`records: ${records.length} across ${picked.length} products`);
  console.log("export written:", exportPath);
  console.log("sources written:", sourcesPath);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
