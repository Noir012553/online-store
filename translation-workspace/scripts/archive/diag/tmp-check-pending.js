// Temporary read-only check: quality status + validationErrors for the imported batch records.
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
const b = require(
  path.join(
    __dirname,
    "..",
    "data",
    "import",
    "assistant-batch-import-next.json",
  ),
);

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const pairs = b.records.map((r) => ({
    entityId: r.productId,
    targetLang: r.targetLang,
  }));
  const docs = await ProductCatalogTranslationCache.find({ $or: pairs })
    .select(
      "entityId targetLang qualityStatus qualityScore validationErrors provider approvedAt",
    )
    .lean();
  const key = (d) => `${d.entityId}:${d.targetLang}`;
  const byKey = new Map(docs.map((d) => [key(d), d]));

  const counts = { approved: 0, pending: 0, other: 0 };
  const pendingReasons = {};
  for (const r of b.records) {
    const d = byKey.get(`${r.productId}:${r.targetLang}`);
    if (!d) {
      console.log("MISSING DOC:", r.productId, r.targetLang);
      continue;
    }
    if (d.qualityStatus === "approved") counts.approved++;
    else if (d.qualityStatus === "pending") {
      counts.pending++;
      const errs = (d.validationErrors || []).join("+") || "(no errors)";
      pendingReasons[errs] = (pendingReasons[errs] || 0) + 1;
      console.log(
        `PENDING ${r.productId.slice(-6)} ${r.targetLang} score=${d.qualityScore} provider=${d.provider} approvedAt=${d.approvedAt ? "yes" : "no"} errors=[${(d.validationErrors || []).join(", ")}]`,
      );
    } else {
      counts.other++;
      console.log("OTHER", d.qualityStatus, r.productId, r.targetLang);
    }
  }
  console.log("\nSummary:", counts);
  console.log("Pending by error:", pendingReasons);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
