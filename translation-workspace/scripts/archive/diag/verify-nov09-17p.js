// Verify DB state after the 17-pending reimport, and diagnose why c645 fr/pt/sv
// remain not_eligible: dump validationErrors + run validator on the import file
// for those 3 records.
const path = require("path");
const fs = require("fs");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const IMPORT = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const TAILS = {
  c645: ["fr", "pt", "sv"],
  c6c8: ["de", "en", "fr", "pt", "es", "sv"],
  c6ca: ["de", "en", "fr", "it", "es", "nl", "pt", "sv"],
};
const recs = d.records.filter((r) =>
  (TAILS[r.productId.slice(-4)] || []).includes(r.targetLang),
);

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const cache = mongoose.connection.db.collection(
    "product_catalog_translation_cache",
  );
  const out = [];
  for (const r of recs) {
    const doc = await cache.findOne(
      { entityId: r.productId, targetLang: r.targetLang },
      {
        projection: {
          qualityStatus: 1,
          qualityScore: 1,
          validationErrors: 1,
          updatedAt: 1,
        },
      },
    );
    out.push(
      `${r.productId.slice(-4)}/${r.targetLang} q=${doc?.qualityStatus} score=${doc?.qualityScore} errs=${JSON.stringify(doc?.validationErrors)}`,
    );
    if (doc?.qualityStatus !== "approved") {
      // run validator field by field to find blocking error
      const src = r.source,
        tr = r.translations;
      const errs = [];
      const mk = validator.checkMarkup(src.description, tr.description);
      if (mk) errs.push("markup(desc)");
      const tech = validator.checkTechnicalTokens(
        src.description,
        tr.description,
      );
      if (tech) errs.push(`tech(desc):${tech.error}:${tech.token}`);
      const leak = validator.checkSourceLanguageLeak(
        src.description,
        tr.description,
        r.targetLang,
        "product_description",
      );
      if (leak) errs.push(`leak(desc):${leak.phrase}`);
      for (const f of ["name", "technicalDescription"]) {
        const t2 = validator.checkTechnicalTokens(src[f], tr[f]);
        if (t2) errs.push(`tech(${f}):${t2.error}:${t2.token}`);
        const m2 = validator.checkMarkup(src[f], tr[f]);
        if (m2) errs.push(`markup(${f})`);
      }
      out.push(
        `   validator: ${errs.join(" | ") || "none — maybe score/inconsistent issue"}`,
      );
    }
  }
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "verify-17p.txt"),
    out.join("\n"),
    "utf8",
  );
  console.log(out.join("\n"));
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
