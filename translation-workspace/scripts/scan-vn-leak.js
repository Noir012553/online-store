// Scan approved translations for untranslated VN diacritic-less fragments in
// name/description/technicalDescription/specs (values are top-level fields).
const path = require("path");
const fs = require("fs");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));

const VN_FRAGMENTS = [
  /\bchat lieu\b/i,
  /\btrong luong\b/i,
  /\bkich thuoc\b/i,
  /\bcong ket noi\b/i,
  /\bkieu tai nghe\b/i,
  /\bloai pin\b/i,
  /\bmau sac\b/i,
  /\bkhong day\b/i,
  /\bco day\b/i,
  /\bcam bien\b/i,
  /\bphuong thuc\b/i,
  /\bdo phan giai\b/i,
  /\bket noi\b/i,
  /\bso luong phim\b/i,
  /\bbao mat\b/i,
  /\btoc do\b/i,
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const cache = mongoose.connection.db.collection(
    "product_catalog_translation_cache",
  );
  const docs = await cache
    .find({ status: "success", qualityStatus: "approved" })
    .toArray();
  console.log("approved docs:", docs.length);
  const out = [];
  const byPid = new Map();
  for (const doc of docs) {
    const pid = doc.entityId;
    const lang = doc.targetLang;
    if (lang === "vi") continue;
    const scanText = (label, text) => {
      if (!text) return;
      for (const re of VN_FRAGMENTS) {
        const m = String(text).match(re);
        if (m) {
          out.push(`${pid.slice(-4)}/${lang} ${label}: "${m[0]}"`);
          byPid.set(pid, (byPid.get(pid) || 0) + 1);
          break;
        }
      }
    };
    scanText("name", doc.name);
    scanText("description", doc.description);
    scanText("technicalDescription", doc.technicalDescription);
    if (doc.specs && typeof doc.specs === "object")
      for (const [k, v] of Object.entries(doc.specs)) {
        scanText(`specs.key:${k}`, k);
        scanText(`specs.val:${k}`, typeof v === "string" ? v : JSON.stringify(v));
      }
    if (Array.isArray(doc.descriptionImages))
      for (const [i, img] of doc.descriptionImages.entries()) {
        scanText(`alt[${i}]`, img && img.alt);
      }
    for (const p of doc.promotions || [])
      scanText("promotion", p && (p.title || ""));
  }
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "vn-leak-scan.txt"),
    out.join("\n"),
    "utf8",
  );
  console.log("hits:", out.length, "products:", byPid.size);
  console.log(out.slice(0, 25).join("\n"));
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
