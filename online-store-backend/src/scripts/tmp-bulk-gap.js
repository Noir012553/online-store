// Bulk export: all products with Vietnamese leftover in fr/pt description, with current sourceHash (CONDITION: fresh hash post-FixA)
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
const fs = require("fs");
const Product = require("../models/Product");
const ProductCatalogTranslationCache = require("../models/ProductCatalogTranslationCache");
const {
  getProductTranslationSourceHash,
} = require("../utils/productTranslationFingerprint");

const strictViet = (s) => typeof s === "string" && /[ăâđêôơư]/.test(s);

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const products = await Product.find({ isDeleted: false })
    .select("_id name brand description technicalDescription")
    .lean();
  const ids = products.map((p) => String(p._id));
  const caches = await ProductCatalogTranslationCache.find({
    entityId: { $in: ids },
    targetLang: { $in: ["fr", "pt"] },
  })
    .select("entityId targetLang description technicalDescription sourceHash")
    .lean();
  const byKey = new Map(
    caches.map((c) => [`${String(c.entityId)}|${c.targetLang}`, c]),
  );

  const out = [];
  let frCount = 0,
    ptCount = 0;
  for (const p of products) {
    const pid = String(p._id);
    const row = {
      id: pid,
      name: p.name?.slice(0, 70),
      sourceHash: getProductTranslationSourceHash(p),
      needs: [],
    };
    for (const lang of ["fr", "pt"]) {
      const c = byKey.get(`${pid}|${lang}`);
      if (!c) {
        row.needs.push(`${lang}:NO_CACHE`);
        continue;
      }
      const descViet = strictViet(c.description);
      const techViet = strictViet(c.technicalDescription);
      // Arc-token check for fr techDesc
      const arcMissing =
        lang === "fr" &&
        typeof c.technicalDescription === "string" &&
        (p.description?.includes("Intel Arc") ||
          JSON.stringify(p.technicalDescription || "").includes("Arc")) &&
        !c.technicalDescription.includes("Arc");
      if (descViet || techViet || arcMissing)
        row.needs.push(
          `${lang}:${[descViet && "desc", techViet && "tech", arcMissing && "ARC_TOKEN"].filter(Boolean).join("+")}`,
        );
      if (descViet || techViet) {
        if (lang === "fr") frCount++;
        else ptCount++;
      }
    }
    if (row.needs.length > 0) out.push(row);
  }
  const file = path.resolve(
    __dirname,
    "../../../translation-workspace/data/export/bulk-frpt-gap.json",
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: out.length,
        frSlots: frCount,
        ptSlots: ptCount,
        rows: out,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(
    JSON.stringify(
      { total: out.length, frSlots: frCount, ptSlots: ptCount, file },
      null,
      2,
    ),
  );
  // first 10 product ids + names
  console.log(
    JSON.stringify(
      out.slice(0, 10).map((r) => ({ id: r.id, name: r.name, needs: r.needs })),
      null,
      2,
    ),
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exitCode = 1;
});
