// Read-only: runs the real validator over the batch file's records and prints
// the exact Vietnamese phrase that triggers `mixed_language`, per field.
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");
const translationValidator = require("./src/utils/translationValidator");

const FILE =
  "E:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-import-10-products.json";

(async () => {
  const records = JSON.parse(fs.readFileSync(FILE, "utf8")).records;
  const ids = [...new Set(records.map((r) => r.productId))];
  await mongoose.connect(process.env.MONGO_URI);
  const products = await mongoose.connection.db
    .collection("products")
    .find({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } })
    .project({
      name: 1,
      description: 1,
      brand: 1,
      technicalDescription: 1,
      specs: 1,
      descriptionImages: 1,
    })
    .toArray();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const check = async (label, source, translated, lang, type) => {
    if (
      typeof source !== "string" ||
      !source.trim() ||
      typeof translated !== "string"
    )
      return;
    const leak = translationValidator.checkSourceLanguageLeak(
      source,
      translated,
      lang,
      type,
    );
    if (leak) console.log(`    ${label}: "${leak.phrase}"`);
  };

  for (const rec of records) {
    const p = byId.get(rec.productId);
    if (!p) {
      console.log(`${rec.productId}/${rec.targetLang}: PRODUCT NOT FOUND`);
      continue;
    }
    const t = rec.translations;
    console.log(`${rec.productId}/${rec.targetLang}`);
    await check("name", p.name, t.name, rec.targetLang, "product_name");
    await check(
      "description",
      p.description,
      t.description,
      rec.targetLang,
      "product_description",
    );
    await check("brand", p.brand, t.brand, rec.targetLang, "product_brand");
    await check(
      "technicalDescription",
      p.technicalDescription,
      t.technicalDescription,
      rec.targetLang,
      "product_technical_description",
    );
    for (const [i, img] of (p.descriptionImages || []).entries()) {
      await check(
        `descriptionImages.${i}.alt`,
        img.alt,
        t.descriptionImages?.[i]?.alt,
        rec.targetLang,
        "product_description_image_alt",
      );
    }
    for (const [k, v] of Object.entries(p.specs || {})) {
      const translatedValue = Object.entries(t.specs || {}).find(
        ([key]) => key.toLowerCase() === k.toLowerCase(),
      )?.[1];
      await check(
        `specs.${k}`,
        String(v),
        translatedValue,
        rec.targetLang,
        "product_spec",
      );
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
