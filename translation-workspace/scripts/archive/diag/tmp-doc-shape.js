const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const fs = require("fs");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const c = mongoose.connection.db.collection(
    "product_catalog_translation_cache",
  );
  const d = await c.findOne({
    entityId: "6ad0cb680069aece85a8c625",
    targetLang: "es",
  });
  const out = [];
  out.push("top-level keys: " + JSON.stringify(Object.keys(d)));
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string")
      out.push(`${k}: ${JSON.stringify(v.slice(0, 300))}`);
    else if (v && typeof v === "object")
      out.push(`${k}: object keys ${JSON.stringify(Object.keys(v))}`);
    else out.push(`${k}: ${JSON.stringify(v)}`);
  }
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "doc-shape.txt"),
    out.join("\n"),
    "utf8",
  );
  console.log("done");
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
