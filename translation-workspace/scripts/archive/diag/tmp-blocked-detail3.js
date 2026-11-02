const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  const products = db.collection("products");

  // only the 13 blocked nov06f slots
  const BLOCKED = [
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
    ["6ad0cb680069aece85a8c625", "es"],
  ];
  const out = [];
  for (const [eid, lang] of BLOCKED) {
    const d = await cache.findOne({ entityId: eid, targetLang: lang });
    if (!d) continue;
    const p = await products.findOne({ _id: new mongoose.Types.ObjectId(eid) });
    out.push("");
    out.push(
      `########## ${eid.slice(-4)} / ${lang}  errors=${JSON.stringify(d.validationErrors)}  score=${d.qualityScore}`,
    );
    out.push(`  name: ${JSON.stringify(d.name)}`);
    out.push(
      `  desc[0:800]: ${JSON.stringify((d.description || "").slice(0, 800))}`,
    );
    out.push(
      `  tech[0:600]: ${JSON.stringify((d.technicalDescription || "").slice(0, 600))}`,
    );
    out.push(`  brand: ${JSON.stringify(d.brand)}`);
    if (p) {
      out.push(`  SRC name: ${JSON.stringify(p.name)}`);
      // find the chip brand mention in source
      const src = p.description || "";
      for (const chip of [
        "Intel",
        "AMD",
        "NVIDIA",
        "Acer",
        "Lenovo",
        "MSI",
        "ASUS",
      ]) {
        const i = src.indexOf(chip);
        if (i >= 0) {
          out.push(
            `  SRC "${chip}" ctx: ${JSON.stringify(src.slice(Math.max(0, i - 80), i + 80))}`,
          );
          break;
        }
      }
      out.push(
        `  SRC tech: ${JSON.stringify((p.technicalDescription || "").slice(0, 500))}`,
      );
    }
  }
  fs.writeFileSync(
    path.join(WS, "logs", "blocked13-detail.txt"),
    out.join("\n"),
    "utf8",
  );
  console.log("done:", out.length, "lines");
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
