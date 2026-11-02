const path = require("path");
const fs = require("fs");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));

const TARGETS = [
  ["6ad0d3990069aece85a8c869", "fr"],
  ["6ad0d3990069aece85a8c874", "en"],
  ["6ad0d3990069aece85a8c875", "en"],
  ["6ad0d3990069aece85a8c876", "en"],
  ["6ad0d3990069aece85a8c884", "it"],
  ["6ad0d3990069aece85a8c886", "nl"],
  ["6ad0d4730069aece85a8c88e", "pt"],
  ["6ad0d3990069aece85a8c896", "it"],
  ["6ad0d3990069aece85a8c89f", "nl"],
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "nov06d-pending.json"),
    JSON.stringify(
      TARGETS.map(([pid, lang]) => ({ pid: pid.slice(-4), lang })),
      null,
      1,
    ),
    "utf8",
  );
  for (const [pid, lang] of TARGETS) {
    const docs = await cache
      .find(
        { entityId: pid, targetLang: lang },
        { projection: { provider: 1, qualityStatus: 1, validationErrors: 1 } },
      )
      .toArray();
    console.log(pid.slice(-4) + "/" + lang);
    for (const d of docs) {
      console.log(
        "   ",
        d.provider +
          "/" +
          d.qualityStatus +
          " errs=" +
          JSON.stringify(d.validationErrors || []),
      );
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
