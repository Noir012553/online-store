// Export an assistant batch restricted to an explicit pid:lang slot list
// (data/export/next50-products.json produced by export-next50.js).
// Writes: data/export/assistant-batch-next.json (standard shape so the
// existing build/preflight scripts keep working) + sources txt.
const fs = require("fs");
const path = require("path");
const BACKEND_DIR = path.join(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND_DIR, "node_modules", "dotenv")).config({
  path: path.join(BACKEND_DIR, ".env"),
});
const mongoose = require(path.join(BACKEND_DIR, "node_modules", "mongoose"));

const CACHE_COLLECTION = "product_catalog_translation_cache";
const LOCALES = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];

const sortObject = (value) => {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((r, k) => {
      r[k] = sortObject(value[k]);
      return r;
    }, {});
};
const isEmptyAlt = (v) =>
  v == null || String(v).trim() === "" || String(v).trim() === "0";
const normalizeImage = (image) => {
  if (!image || typeof image !== "object" || Array.isArray(image)) return image;
  if (String(image.alt ?? "").trim() !== "0") return image;
  return { ...image, alt: null };
};
const getSource = (p = {}) => ({
  name: p.name ?? "",
  description: p.description ?? "",
  brand: p.brand ?? "",
  specs: p.specs ?? {},
  technicalDescription: p.technicalDescription ?? "",
  descriptionImages: (p.descriptionImages ?? []).map(normalizeImage),
  promotions: p.promotions ?? [],
});
const crypto = require("crypto");
const hashOf = (product) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(sortObject(getSource(product))))
    .digest("hex");

(async () => {
  if (!process.env.MONGO_URI)
    throw new Error("MONGO_URI is not set (check backend .env)");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const products = db.collection("products");

  const slotList = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "data", "export", "next50-products.json"),
      "utf8",
    ),
  );
  const { ObjectId } = require(
    path.join(
      BACKEND_DIR,
      "node_modules",
      "mongoose",
      "node_modules",
      "mongodb",
    ),
  );
  const oids = slotList.map((s) => ObjectId.createFromHexString(s.pid));
  const docs = await products.find({ _id: { $in: oids } }).toArray();
  const docMap = new Map(docs.map((d) => [d._id.toString(), d]));

  const records = [];
  const sourcesTxt = [];
  const emptyTranslations = (src) => ({
    name: "",
    description: "",
    brand: "",
    specs: {},
    technicalDescription: "",
    descriptionImages: (src.descriptionImages ?? []).map((img) => ({
      url: img.url,
      alt: "",
    })),
    promotions: src.promotions ?? [],
  });

  for (const slot of slotList) {
    const doc = docMap.get(slot.pid);
    if (!doc) {
      console.log("SKIP missing product:", slot.pid);
      continue;
    }
    const src = getSource(doc);
    for (const lang of slot.gaps) {
      records.push({
        productId: slot.pid,
        targetLang: lang,
        sourceHash: hashOf(doc),
        fields: [
          "name",
          "description",
          "brand",
          "specs",
          "technicalDescription",
          "descriptionImages",
          "promotions",
        ],
        source: src,
        translations: emptyTranslations(src),
      });
      sourcesTxt.push(
        `===== PRODUCT ${slot.pid} =====\nLANGS: ${lang}\nNAME: ${src.name}\nBRAND: ${src.brand}\nSPECS (key=value):\n` +
          Object.entries(src.specs || {})
            .map(([k, v]) => `  ${k} = ${v}`)
            .join("\n") +
          `\nTECH_DESCRIPTION (verbatim):\n${src.technicalDescription}\nDESCRIPTION (verbatim):\n${src.description}\nIMAGE_ALTS:\n` +
          (src.descriptionImages || [])
            .map((img, i) => `  [${i}] ${img.alt ?? ""}`)
            .join("\n") +
          `\nPROMOTIONS:\n` +
          (src.promotions || [])
            .map(
              (p, i) =>
                `  [${i}] type=${p.type} title="${p.title}" giftProductName="${p.giftProductName}" scope="${p.scope}" discountText="${p.discountText}"`,
            )
            .join("\n") +
          `\n`,
      );
    }
  }

  const out = { workflow: "assistant_batch", records };
  fs.writeFileSync(
    path.join(__dirname, "..", "data", "export", "assistant-batch-next.json"),
    JSON.stringify(out, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(__dirname, "..", "data", "sources-for-translation-next.txt"),
    sourcesTxt.join("\n"),
    "utf8",
  );
  console.log(
    "records:",
    records.length,
    "-> data/export/assistant-batch-next.json",
  );
  console.log(
    "sources:",
    sourcesTxt.length,
    "-> data/sources-for-translation-next.txt",
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
