// Diagnose missing_brand precisely: list brand tokens present in source
// name/description but missing in translation.
const path = require("path");
const fs = require("fs");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const importData = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "data",
      "import",
      "assistant-batch-import-nov06d.json",
    ),
    "utf8",
  ),
);

const PENDING = [
  ["c7c3", "it"],
  ["c869", "fr"],
  ["c874", "en"],
  ["c875", "en"],
  ["c876", "en"],
  ["c8c6", "fr"],
  ["c8df", "it"],
  ["c8e1", "pt"],
  ["c623", "fr"],
  ["c623", "it"],
  ["c636", "en"],
  ["c636", "it"],
  ["c640", "it"],
  ["c640", "es"],
  ["c653", "it"],
  ["c653", "es"],
  ["c697", "pt"],
  ["c697", "fr"],
  ["c69e", "pt"],
  ["c69e", "fr"],
  ["c69f", "pt"],
  ["c69f", "fr"],
  ["c6a3", "fr"],
  ["c6a3", "nl"],
  ["c6c7", "de"],
  ["c6c7", "sv"],
];
const byKey = new Map(
  importData.records.map((r) => [`${r.productId}:${r.targetLang}`, r]),
);

for (const [tail, lang] of PENDING) {
  const rec = [...byKey.entries()].find(([k]) => k.endsWith(tail + ":" + lang));
  if (!rec) continue;
  const [key, rec2] = rec;
  const src = rec2.source.description + " " + rec2.source.name;
  const tr = rec2.translations.description + " " + rec2.translations.name;
  // Brand tokens: uppercase words of length>=3, or known brands
  const brands = new Set();
  for (const m of src.matchAll(
    /\b(AULA|ASUS|ROG|Akko|AKKO|Corsair|DareU|VEEKOS|Veekos|Logitech|Logi|Razer|Rapoo|MSI|Lenovo|HP|Dell|Acer|UGREEN|Baseus|Lofree|Attack Shark|VXE|ATK|Iron Cat|Pulsar|Fantech|Kemove|MCHOSE|Motospeed|HyperX|HYPERX|Cloud|TPU)\b/g,
  ))
    brands.add(m[1]);
  const missing = [...brands].filter((b) => !tr.includes(b));
  console.log(tail + "/" + lang, "missing:", missing.join(", ") || "(none)");
  // Sample context for first missing brand
  if (missing.length) {
    const first = missing[0];
    const i = src.indexOf(first);
    console.log(
      "   ctx:",
      JSON.stringify(src.slice(Math.max(0, i - 80), i + 100)),
    );
  }
}
