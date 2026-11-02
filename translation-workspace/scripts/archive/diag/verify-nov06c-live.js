// Verify the 9 fixed nov06c records are live in the backend cache.
const path = require("path");
const { mongoose } = require(
  path.resolve(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "node_modules",
    "mongoose",
  ),
);
const Livetranslationcache = require(
  path.resolve(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "src",
    "models",
    "livetranslationcache.js",
  ),
);

const IDS = [
  ["6ad0cc010069aece85a8c638", "en"],
  ["6ad0cc010069aece85a8c639", "en"],
  ["6ad0cc440069aece85a8c654", "it"],
  ["6ad0cc440069aece85a8c658", "it"],
  ["6ad0ce6e0069aece85a8c6be", "it"],
  ["6ad0ce6e0069aece85a8c6c0", "en"],
  ["6ad0ce6e0069aece85a8c6c1", "nl"],
  ["6ad0ce6e0069aece85a8c6c2", "it"],
  ["6ad0cff40069aece85a8c6f8", "it"],
];

(async () => {
  await mongoose.connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/laptop",
    {
      serverSelectionTimeoutMS: 8000,
    },
  );
  let allOk = true;
  for (const [pid, lang] of IDS) {
    const cache = await Livetranslationcache.findOne({
      productId: pid,
      targetLang: lang,
    })
      .sort({ createdAt: -1 })
      .lean();
    const status = cache?.translations?.qualityStatus || cache?.qualityStatus;
    const errors =
      cache?.translations?.validationErrors || cache?.validationErrors;
    const ok = status === "live" && (!errors || errors.length === 0);
    if (!ok) allOk = false;
    console.log(
      `${pid.slice(-4)}/${lang} status=${status} errors=${JSON.stringify(errors || []).slice(0, 60)}`,
    );
  }
  console.log(allOk ? "ALL 9 LIVE ✓" : "SOME PENDING ✗");
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
