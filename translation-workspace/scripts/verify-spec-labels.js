// Verify: vi locale shows proper Vietnamese label (with diacritics) for
// shellMaterial and other keys.
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
const { getSpecKeyLabels, getCanonicalSpecKey } = require(
  path.join(BACKEND, "src", "services", "specKeyTranslationService.js"),
);

(async () => {
  const specs = {
    shellMaterial: "Nhựa ABS",
    screenSize: '15.6"',
    weight: "1.2 kg",
    sensor: "Quang học",
    connection: "Không dây",
    chat_lieu_vo: "Nhựa", // legacy raw key from a crawler
  };
  console.log(
    "canonical(chat_lieu_vo):",
    JSON.stringify(getCanonicalSpecKey("chat_lieu_vo")),
  );
  for (const lang of ["vi", "en", "fr", "de"]) {
    const labels = await getSpecKeyLabels(specs, lang);
    console.log(`--- ${lang} ---`);
    console.log(JSON.stringify(labels, null, 2));
  }
  process.exit(0);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
