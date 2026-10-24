// Read-only: reproduces the validator for the 8 failing records and prints the
// exact field + phrase + source snippet behind each `mixed_language`.
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");
const translationValidator = require("./src/utils/translationValidator");

const FILE =
  "E:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-import-10-products.json";
const TARGETS = [
  ["c918", "en"],
  ["c919", "fr"],
  ["c91a", "fr"],
  ["c91b", "it"],
  ["c91c", "it"],
  ["c91c", "nl"],
  ["c91d", "nl"],
  ["c91f", "nl"],
  ["c920", "nl"],
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const records = JSON.parse(fs.readFileSync(FILE, "utf8")).records;
  const ids = [...new Set(records.map((r) => r.productId))];
  const products = await mongoose.connection.db
    .collection("products")
    .find({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } })
    .toArray();
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  const check = (rec, field, source, translated, type) => {
    if (
      typeof source !== "string" ||
      !source.trim() ||
      typeof translated !== "string"
    )
      return;
    const leak = translationValidator.checkSourceLanguageLeak(
      source,
      translated,
      rec.targetLang,
      type,
    );
    if (!leak) return;
    const src = String(source);
    const idx = src.toLowerCase().indexOf(String(leak.phrase).toLowerCase());
    console.log(`  ${field}  phrase="${leak.phrase}"`);
    console.log(
      `     source(ctx): ${JSON.stringify(src.slice(Math.max(0, idx - 70), idx + 80))}`,
    );
    const tIdx = String(translated)
      .toLowerCase()
      .indexOf(String(leak.phrase).toLowerCase());
    console.log(
      `     translation(ctx): ${JSON.stringify(String(translated).slice(Math.max(0, tIdx - 70), tIdx + 80))}`,
    );
  };

  for (const [suffix, lang] of TARGETS) {
    const rec = records.find(
      (r) => r.productId.endsWith(suffix) && r.targetLang === lang,
    );
    const p = byId.get(rec.productId);
    const t = rec.translations;
    console.log(`\n=== ${suffix}/${lang} (${rec.productId})`);
    check(rec, "name", p.name, t.name, "product_name");
    check(
      rec,
      "description",
      p.description,
      t.description,
      "product_description",
    );
    check(rec, "brand", p.brand, t.brand, "product_brand");
    check(
      rec,
      "technicalDescription",
      p.technicalDescription,
      t.technicalDescription,
      "product_technical_description",
    );
    (p.descriptionImages || []).forEach((img, i) =>
      check(
        rec,
        `descriptionImages.${i}.alt`,
        img.alt,
        t.descriptionImages?.[i]?.alt,
        "product_description_image_alt",
      ),
    );
    for (const [k, v] of Object.entries(p.specs || {})) {
      const tv = Object.entries(t.specs || {}).find(
        ([key]) => key.toLowerCase() === k.toLowerCase(),
      )?.[1];
      check(rec, `specs.${k}`, String(v), tv, "product_spec");
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
