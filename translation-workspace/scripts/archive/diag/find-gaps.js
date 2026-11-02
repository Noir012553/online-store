// Read-only scan: find products with missing / not-approved translation locales.
// Writes UTF-8 report to logs/find-gaps-last.txt.
const path = require("path");
const fs = require("fs");

const BACKEND_DIR = path.join(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND_DIR, "node_modules", "dotenv")).config({
  path: path.join(BACKEND_DIR, ".env"),
});
const mongoose = require(path.join(BACKEND_DIR, "node_modules", "mongoose"));

const REPORT_FILE = path.join(__dirname, "..", "logs", "find-gaps-last.txt");
const CACHE_COLLECTION = "product_catalog_translation_cache";
const LOCALES = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];

const lines = [];
function out(s) {
  lines.push(s);
  console.log(s);
}

(async () => {
  if (!process.env.MONGO_URI)
    throw new Error("MONGO_URI is not set (check backend .env)");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const products = db.collection("products");
  const cache = db.collection(CACHE_COLLECTION);

  const total = await products.countDocuments({});
  out(`Total products: ${total}`);

  // Products not yet fully ready, or with not-approved locale slots
  const prodDocs = await products
    .find(
      { $or: [{ translationReady: { $ne: true } }] },
      { projection: { name: 1, sku: 1, translationReady: 1 } },
    )
    .limit(200)
    .toArray();
  out(`Products with translationReady != true: ${prodDocs.length}\n`);

  const ids = prodDocs.map((p) => p._id);
  const cacheDocs = await cache
    .find(
      { entityId: { $in: ids.map(String) } },
      {
        projection: {
          entityId: 1,
          targetLang: 1,
          status: 1,
          qualityStatus: 1,
          qualityScore: 1,
          validationErrors: 1,
          provider: 1,
          providerSource: 1,
          updatedAt: 1,
        },
      },
    )
    .toArray();
  const byProduct = new Map();
  for (const c of cacheDocs) {
    if (!byProduct.has(c.entityId)) byProduct.set(c.entityId, new Map());
    byProduct.get(c.entityId).set(c.targetLang, c);
  }

  for (const p of prodDocs) {
    const cMap = byProduct.get(p._id.toString()) || new Map();
    const slots = [];
    for (const lang of LOCALES) {
      const c = cMap.get(lang);
      if (!c) {
        slots.push(`${lang}:MISSING`);
        continue;
      }
      if (c.qualityStatus !== "approved") {
        slots.push(
          `${lang}:${c.status}/${c.qualityStatus}${c.qualityScore != null ? `(${c.qualityScore})` : ""}`,
        );
      } else if (c.qualityScore != null && c.qualityScore < 100) {
        slots.push(`${lang}:approved(${c.qualityScore})`);
      }
    }
    if (slots.length) {
      out(`${p._id} | ${p.sku || "no-sku"} | ${p.name}`);
      out(`   ${slots.join(" | ")}`);
    }
  }

  // also count products that ARE ready, for context
  const ready = await products.countDocuments({ translationReady: true });
  out(`\nContext: translationReady=true: ${ready}/${total}`);

  await mongoose.disconnect();
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, lines.join("\n") + "\n", { encoding: "utf8" });
  console.log(`\nUTF-8 report saved: ${REPORT_FILE}`);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
