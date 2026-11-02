const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const fs = require("fs");

// All 19 pending slots (entityId + targetLang)
const PENDING = [
  ["6ad0cde40069aece85a8c694", "es"],
  ["6ad0d25d0069aece85a8c7b8", "es"],
  ["6ad0cb680069aece85a8c61c", "es"],
  ["6ad0cb680069aece85a8c61c", "sv"],
  ["6ad0cb680069aece85a8c625", "es"],
  ["6ad0cb680069aece85a8c625", "sv"],
  ["6ad0cc010069aece85a8c645", "pt"],
  ["6ad0cc010069aece85a8c645", "fr"],
  ["6ad0cc010069aece85a8c645", "sv"],
  ["6ad0cde40069aece85a8c6a2", "pt"],
  ["6ad0cde40069aece85a8c6a2", "fr"],
  ["6ad0cde40069aece85a8c6a2", "es"],
  ["6ad0d2af0069aece85a8c7ca", "en"],
  ["6ad0d2af0069aece85a8c7ca", "fr"],
  ["6ad0d2af0069aece85a8c7ca", "it"],
  ["6ad0d5ed0069aece85a8c887", "es"],
  ["6ad0d5ed0069aece85a8c888", "es"],
  ["6ad0d5ed0069aece85a8c88c", "nl"],
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const c = mongoose.connection.db.collection(
    "product_catalog_translation_cache",
  );
  const docs = await c
    .find({
      entityId: { $in: [...new Set(PENDING.map((p) => p[0]))] },
      targetLang: { $in: [...new Set(PENDING.map((p) => p[1]))] },
    })
    .toArray();

  const lines = [];
  for (const d of docs) {
    lines.push(
      `=== ${d.entityId} / ${d.targetLang} | status=${d.qualityStatus} score=${d.qualityScore} provider=${d.provider}`,
    );
    lines.push(`validationErrors: ${JSON.stringify(d.validationErrors)}`);
    const t = d.translation || d.translations || {};
    for (const k of ["name", "description", "brand", "technicalDescription"]) {
      const v = t[k];
      if (v !== undefined) {
        const s = typeof v === "string" ? v : JSON.stringify(v);
        lines.push(
          `${k}: ${s.length > 400 ? s.slice(0, 400) + "…[" + s.length + "]" : s}`,
        );
      }
    }
    lines.push("");
  }
  const out = lines.join("\n");
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "pending-detail.txt"),
    out,
    "utf8",
  );
  console.log("written", docs.length, "docs");
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
