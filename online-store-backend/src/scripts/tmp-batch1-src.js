// TEMP read-only: get sources for batch 1 (4 Acer models)
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
const P = require("../models/Product");
const IDS = [
  "6ad0ca970069aece85a8c5da",
  "6ad0ca970069aece85a8c5db",
  "6ad0cb680069aece85a8c613",
  "6ad0cb680069aece85a8c612",
];
(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const ps = await P.find({ _id: { $in: IDS } })
    .select("_id name description technicalDescription brand")
    .lean();
  const out = {};
  ps.forEach((p) => {
    out[String(p._id)] = {
      name: p.name,
      descLen: p.description?.length,
      description: p.description,
      tech: p.technicalDescription,
    };
  });
  fs.writeFileSync(
    path.resolve(__dirname, "tmp-batch1-src.json"),
    JSON.stringify(out, null, 2),
    "utf8",
  );
  console.log("saved", Object.keys(out).length, "sources");
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exitCode = 1;
});
