// Chi tiết từng slot bị block: so sánh bản dịch với nguồn tiếng Việt
const path = require("path");
const fs = require("fs");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));

const ONLY_IDS = process.argv[2] ? process.argv[2].split(",") : null;
const LIMIT = parseInt(process.argv[3] || "999", 10);

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  const products = db.collection("products");
  const out = [];

  const q = {
    provider: "assistant",
    $or: [
      { validationErrors: { $exists: true, $ne: [] } },
      { qualityScore: { $lt: 100 } },
    ],
  };
  if (ONLY_IDS) q.entityId = { $in: ONLY_IDS };

  const docs = await cache
    .find(q)
    .sort({ entityId: 1, targetLang: 1 })
    .limit(LIMIT)
    .toArray();
  out.push(`total blocked docs: ${docs.length}`);

  // group by entity
  const byEntity = {};
  for (const d of docs) {
    (byEntity[d.entityId] = byEntity[d.entityId] || []).push(d);
  }

  const langs = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];
  for (const [eid, list] of Object.entries(byEntity)) {
    const p = await products.findOne({ _id: new mongoose.Types.ObjectId(eid) });
    out.push("");
    out.push(`########## ${eid}  (${p ? p.name : "PRODUCT NOT FOUND"})`);
    if (p) {
      out.push(`SRC name: ${p.name}`);
      out.push(
        `SRC desc[0:500]: ${JSON.stringify((p.description || "").slice(0, 500))}`,
      );
      out.push(
        `SRC tech[0:400]: ${JSON.stringify((p.technicalDescription || "").slice(0, 400))}`,
      );
    }
    for (const lang of langs) {
      const d = list.find((x) => x.targetLang === lang);
      if (!d) {
        out.push(`  --- ${lang}: MISSING in cache`);
        continue;
      }
      const errs = (d.validationErrors || []).join(",");
      const extra =
        errs && errs !== "inconsistent"
          ? `  <<< NON-OVERRIDE ERRORS: ${errs}`
          : errs
            ? "  (inconsistent only)"
            : "";
      out.push(
        `  --- ${lang}  score=${d.qualityScore} status=${d.qualityStatus}${extra}`,
      );
      out.push(`    name: ${JSON.stringify(d.name)}`);
      out.push(
        `    desc[0:400]: ${JSON.stringify((d.description || "").slice(0, 400))}`,
      );
      out.push(
        `    tech[0:400]: ${JSON.stringify((d.technicalDescription || "").slice(0, 400))}`,
      );
      if (
        errs.includes("mixed_language") ||
        errs.includes("missing_technical_token") ||
        errs.includes("markup_mismatch")
      ) {
        out.push(
          `    desc[400:1200]: ${JSON.stringify((d.description || "").slice(400, 1200))}`,
        );
        out.push(
          `    tech full: ${JSON.stringify(d.technicalDescription || "")}`,
        );
      }
    }
  }

  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "blocked-details.txt"),
    out.join("\n"),
    "utf8",
  );
  console.log(
    `done, ${docs.length} docs, entities: ${Object.keys(byEntity).length}`,
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
