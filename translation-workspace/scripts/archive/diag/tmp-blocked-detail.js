const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const fs = require("fs");

// 15 blocked slots (excluding the 4 clean pending ones)
const PENDING = [
  ["6ad0cb680069aece85a8c625", "es"],
  ["6ad0cc010069aece85a8c645", "fr"],
  ["6ad0cc010069aece85a8c645", "pt"],
  ["6ad0cc010069aece85a8c645", "sv"],
  ["6ad0cde40069aece85a8c6a2", "es"],
  ["6ad0cde40069aece85a8c6a2", "fr"],
  ["6ad0cde40069aece85a8c6a2", "pt"],
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
    lines.push(`=== ${d.entityId} / ${d.targetLang}`);
    lines.push(`errors: ${JSON.stringify(d.validationErrors)}`);
    const t = d.translation || d.translations || {};
    // name
    lines.push(`name: ${JSON.stringify(t.name)}`);
    // description: first 600 chars
    const desc = t.description || "";
    lines.push(`desc[0:600]: ${JSON.stringify(desc.slice(0, 600))}`);
    // tech
    lines.push(
      `tech: ${JSON.stringify((t.technicalDescription || "").slice(0, 400))}`,
    );
    // specs
    lines.push(`specs: ${JSON.stringify(t.specs)}`);
    lines.push("");
  }
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "blocked-detail.txt"),
    lines.join("\n"),
    "utf8",
  );
  console.log("written", docs.length, "docs");
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
