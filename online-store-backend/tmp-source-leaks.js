// Read-only: prints the Vietnamese source fields that contain the leaked
// phrase, i.e. what the validator matched inside the translation.
require("dotenv").config();
const mongoose = require("mongoose");

const NEEDLES = [
  "sensor thế",
  "pro black là",
  "pro white là",
  "vertical sử",
  "gearvn để",
  "vấn đề",
];
const IDS = [
  "6ad0d7c80069aece85a8c917",
  "6ad0d7c80069aece85a8c918",
  "6ad0d7c80069aece85a8c919",
  "6ad0d7c80069aece85a8c91a",
  "6ad0d7c80069aece85a8c91b",
  "6ad0d7c80069aece85a8c91c",
  "6ad0d7c80069aece85a8c91d",
  "6ad0d7c80069aece85a8c91e",
  "6ad0d7c80069aece85a8c91f",
  "6ad0d7c80069aece85a8c920",
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const docs = await mongoose.connection.db
    .collection("products")
    .find({ _id: { $in: IDS.map((id) => new mongoose.Types.ObjectId(id)) } })
    .toArray();
  const show = (id, field, text) => {
    const lower = String(text).toLowerCase();
    for (const n of NEEDLES) {
      const i = lower.indexOf(n);
      if (i >= 0)
        console.log(
          `${id} | ${field} | ${JSON.stringify(String(text).slice(Math.max(0, i - 60), i + 60))}`,
        );
    }
  };
  for (const p of docs) {
    const id = String(p._id).slice(-3);
    show(id, "name", p.name || "");
    show(id, "description", p.description || "");
    show(id, "technicalDescription", p.technicalDescription || "");
    for (const [k, v] of Object.entries(p.specs || {}))
      show(id, `specs.${k}`, v);
    (p.descriptionImages || []).forEach((img, i) =>
      show(id, `alt[${i}]`, img.alt || ""),
    );
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
