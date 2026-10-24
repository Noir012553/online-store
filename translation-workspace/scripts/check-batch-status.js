// Read-only verification of an assistant batch against MongoDB.
// Fixes applied vs the first draft:
//   1. Correct module paths: this script lives in translation-workspace/scripts,
//      so backend modules are at ../../online-store-backend/node_modules.
//   2. Correct batch file path: ../data/import/... (data/ is at workspace root).
//   3. Correct cache collection name: product_catalog_translation_cache
//      (not productcatalogtranslationcaches).
//   4. Correct field names: cache docs use entityId (string) + targetLang,
//      not productId/language.
//   5. products._id must be queried as ObjectId, not string.
//   6. UTF-8 safe output: Vietnamese product names can garble in the Windows
//      console, so the full report is also written to logs/ as UTF-8.
//
// Read-only: no writes to the database.
const path = require("path");
const fs = require("fs");

const BACKEND_DIR = path.join(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND_DIR, "node_modules", "dotenv")).config({
  path: path.join(BACKEND_DIR, ".env"),
});
const mongoose = require(path.join(BACKEND_DIR, "node_modules", "mongoose"));
const { ObjectId } = require(
  path.join(BACKEND_DIR, "node_modules", "mongoose", "node_modules", "mongodb"),
);

const FILE = path.join(__dirname, "..", "data", "import", "assistant-batch-import-10-products.json");
const REPORT_FILE = path.join(__dirname, "..", "logs", "check-batch-status-last.txt");
const CACHE_COLLECTION = "product_catalog_translation_cache";
const LOCALES = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];

// Collect lines instead of console.log directly so we can save a UTF-8 copy.
const lines = [];
function out(s) {
  lines.push(s);
  console.log(s);
}

(async () => {
  const batch = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const uniqueIds = [...new Set(batch.records.map((r) => r.productId))];
  out(`Batch file: ${path.basename(FILE)}`);
  out(`Batch records: ${batch.records.length} | unique products: ${uniqueIds.length}`);

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set (check backend .env)");

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const products = db.collection("products");
  const cache = db.collection(CACHE_COLLECTION);

  // 1. Products exist — _id is ObjectId, cast the batch ids.
  const oidIds = uniqueIds.map((id) => {
    try { return ObjectId.createFromHexString(id); } catch { return id; }
  });
  const prodDocs = await products
    .find(
      { _id: { $in: oidIds } },
      { projection: { name: 1, sku: 1, translationReady: 1 } },
    )
    .toArray();
  const prodMap = new Map(prodDocs.map((p) => [p._id.toString(), p]));
  out(`\n--- PRODUCTS (${prodDocs.length}/${uniqueIds.length} found) ---`);
  for (const id of uniqueIds) {
    const p = prodMap.get(id);
    out(`${id} | ${p ? `${p.sku || "no-sku"} | ${p.name}` : "NOT FOUND"}`);
  }

  // 2. Catalog cache records — entityId is a string, targetLang is the locale.
  const cacheDocs = await cache
    .find(
      { entityId: { $in: uniqueIds } },
      {
        projection: {
          entityId: 1,
          targetLang: 1,
          status: 1,
          qualityStatus: 1,
          qualityScore: 1,
          validationErrors: 1,
          sourceHash: 1,
          provider: 1,
          providerSource: 1,
          updatedAt: 1,
          approvalReview: 1,
        },
      },
    )
    .toArray();

  // group by product
  const byProduct = new Map();
  for (const c of cacheDocs) {
    const k = String(c.entityId);
    if (!byProduct.has(k)) byProduct.set(k, new Map());
    byProduct.get(k).set(c.targetLang, c);
  }

  const batchByProduct = new Map();
  for (const r of batch.records) {
    if (!batchByProduct.has(r.productId)) batchByProduct.set(r.productId, []);
    batchByProduct.get(r.productId).push(r);
  }

  out(`\n--- CATALOG CACHE (${CACHE_COLLECTION}) ---`);
  out(`Cache docs found: ${cacheDocs.length} (batch covers ${batch.records.length} locale slots)`);
  const summary = {
    approved: 0, pending: 0, other: 0, missing: 0, hashMismatch: 0, lowScore: 0,
  };
  for (const [pid, recs] of batchByProduct) {
    const p = prodMap.get(pid);
    out(`\n[${pid}] ${p ? p.name : "PRODUCT NOT FOUND"} (batch: ${recs.map((r) => r.targetLang).join(",")})`);
    const cMap = byProduct.get(pid) || new Map();
    for (const lang of LOCALES) {
      const c = cMap.get(lang);
      if (!c) { out(`  ${lang}: MISSING`); summary.missing++; continue; }
      const status = `${c.status}/${c.qualityStatus}${c.qualityScore != null ? ` score:${c.qualityScore}` : ""}`;
      const errs = c.validationErrors && c.validationErrors.length
        ? ` errors:${JSON.stringify(c.validationErrors)}`
        : "";
      const prov = c.provider ? ` prov:${c.provider}/${c.providerSource || "-"}` : "";
      out(`  ${lang}: ${status}${errs}${prov} hash:${(c.sourceHash || "").slice(0, 8)} upd:${c.updatedAt ? c.updatedAt.toISOString().slice(0, 16) : "-"}`);
      if (c.qualityStatus === "approved") summary.approved++;
      else if (c.qualityStatus === "pending") summary.pending++;
      else summary.other++;
      if (c.qualityScore != null && c.qualityScore < 100) summary.lowScore++;
      const b = recs.find((r) => r.targetLang === lang);
      if (b && c.sourceHash && c.sourceHash !== b.sourceHash) summary.hashMismatch++;
    }
  }

  const batchProducts = batchByProduct.size;
  out(`\n--- SUMMARY (expected ${batchProducts * LOCALES.length} cache docs = ${batchProducts} products x ${LOCALES.length} locales) ---`);
  out(JSON.stringify(summary));
  const ready = prodDocs.filter((p) => p.translationReady === true).length;
  out(`translationReady=true: ${ready}/${prodDocs.length}`);

  await mongoose.disconnect();

  // Save a UTF-8 copy so Vietnamese names never garble in the terminal.
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, lines.join("\n") + "\n", { encoding: "utf8" });
  console.log(`\nUTF-8 report saved: ${REPORT_FILE}`);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
